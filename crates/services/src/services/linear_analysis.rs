//! Background service that polls for Linear issues pending GitNexus impact analysis
//! and spawns Claude Code to analyze them.

use std::{path::PathBuf, time::Duration};

use tokio::time::interval;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use super::remote_client::RemoteClient;

const POLL_INTERVAL_SECS: u64 = 60;

pub struct LinearAnalysisService {
    remote_client: RemoteClient,
    repo_path: PathBuf,
}

impl LinearAnalysisService {
    /// Spawn the background service. Returns None if no remote client or repo path is configured.
    pub fn spawn(
        remote_client: Option<RemoteClient>,
        repo_path: Option<PathBuf>,
    ) -> Option<tokio::task::JoinHandle<()>> {
        let remote_client = remote_client?;
        let repo_path = repo_path?;

        let service = Self {
            remote_client,
            repo_path,
        };

        Some(tokio::spawn(async move {
            service.start().await;
        }))
    }

    async fn start(&self) {
        info!(
            "Starting Linear GitNexus analysis service (repo: {}, interval: {}s)",
            self.repo_path.display(),
            POLL_INTERVAL_SECS
        );

        let mut ticker = interval(Duration::from_secs(POLL_INTERVAL_SECS));
        ticker.tick().await; // skip immediate first tick

        loop {
            ticker.tick().await;
            self.run_once().await;
        }
    }

    async fn run_once(&self) {
        let issues = match self.fetch_pending_issues().await {
            Ok(v) => v,
            Err(e) => {
                warn!(?e, "Failed to fetch pending Linear analysis issues");
                return;
            }
        };

        if issues.is_empty() {
            debug!("No Linear issues pending GitNexus analysis");
            return;
        }

        info!("{} Linear issue(s) pending GitNexus analysis", issues.len());

        for (issue_id, title, description, worktree_branch, comments) in issues {
            self.analyze_issue(
                issue_id,
                &title,
                description.as_deref(),
                worktree_branch.as_deref(),
                &comments,
            )
            .await;
        }
    }

    async fn fetch_pending_issues(
        &self,
    ) -> Result<Vec<(Uuid, String, Option<String>, Option<String>, Vec<String>)>, String> {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct PendingIssue {
            issue_id: Uuid,
            title: String,
            description: Option<String>,
            worktree_branch: Option<String>,
            #[serde(default)]
            comments: Vec<String>,
        }

        let token = self
            .remote_client
            .access_token()
            .await
            .map_err(|e| e.to_string())?;

        let base = self.remote_client.base_url();
        let base = if base.ends_with('/') {
            base.to_string()
        } else {
            format!("{base}/")
        };
        let url = format!("{base}v1/linear/pending-analysis");

        let resp = reqwest::Client::new()
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status()));
        }

        let issues: Vec<PendingIssue> = resp.json().await.map_err(|e| e.to_string())?;
        Ok(issues
            .into_iter()
            .map(|i| {
                (
                    i.issue_id,
                    i.title,
                    i.description,
                    i.worktree_branch,
                    i.comments,
                )
            })
            .collect())
    }

    async fn analyze_issue(
        &self,
        issue_id: Uuid,
        title: &str,
        description: Option<&str>,
        worktree_branch: Option<&str>,
        comments: &[String],
    ) {
        let prompt = build_prompt(title, description, comments);

        info!(%issue_id, %title, "Running GitNexus analysis for Linear issue");

        // Inherit the current process environment so claude can find its auth
        // credentials (keychain access, HOME, PATH, etc.)
        let home = std::env::var("HOME").unwrap_or_default();
        let path = std::env::var("PATH").unwrap_or_default();

        let output = tokio::process::Command::new("claude")
            .arg("--dangerously-skip-permissions")
            .arg("--no-session-persistence")
            .arg("--no-chrome")
            .arg("--setting-sources")
            .arg("project,local")
            .arg("--mcp-config")
            .arg(gitnexus_mcp_config_arg())
            .arg("--output-format")
            .arg("text")
            .arg("--print")
            .arg(&prompt)
            .current_dir(&self.repo_path)
            .env("HOME", &home)
            .env("PATH", &path)
            .stdin(std::process::Stdio::null())
            .output()
            .await;

        match output {
            Err(e) => {
                error!(?e, %issue_id, "Failed to spawn claude for GitNexus analysis");
            }
            Ok(out) if !out.status.success() => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                error!(%issue_id, %stderr, "Claude exited with error during GitNexus analysis");
            }
            Ok(out) => {
                let analysis = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if analysis.is_empty() {
                    warn!(%issue_id, "GitNexus analysis returned empty output");
                    return;
                }

                let comment = format!("## GitNexus Impact Analysis\n\n{analysis}");

                if let Err(e) = self
                    .remote_client
                    .create_issue_comment(issue_id, &comment)
                    .await
                {
                    error!(?e, %issue_id, "Failed to post GitNexus analysis comment");
                    return;
                }

                if let Err(e) = self.mark_analyzed(issue_id).await {
                    error!(?e, %issue_id, "Failed to mark issue as analyzed");
                } else {
                    info!(%issue_id, "GitNexus analysis comment posted successfully");
                }

                // Auto-start workspace if impact score < 50 and branch label is set
                if let Some(branch) = worktree_branch
                    && let Some(score) = parse_impact_score(&analysis)
                    && score < 50
                {
                    info!(%issue_id, score, branch, "Low impact score — auto-starting workspace");
                    if let Err(e) = self
                        .auto_start_workspace(issue_id, title, description, comments, branch)
                        .await
                    {
                        error!(?e, %issue_id, "Failed to auto-start workspace");
                    }
                }
            }
        }
    }

    async fn auto_start_workspace(
        &self,
        issue_id: Uuid,
        title: &str,
        description: Option<&str>,
        comments: &[String],
        branch: &str,
    ) -> Result<(), String> {
        // Read the local backend port from the port file
        let port = utils::port_file::read_port_file("vibe-kanban")
            .await
            .map_err(|e| format!("Failed to read port file: {e}"))?;

        let local_url = format!("http://127.0.0.1:{port}");

        // Get all repos from the local backend
        #[derive(serde::Deserialize)]
        struct RepoListResponse {
            data: Vec<RepoItem>,
        }
        #[derive(serde::Deserialize)]
        struct RepoItem {
            id: uuid::Uuid,
        }

        let repos_resp = reqwest::Client::new()
            .get(format!("{local_url}/repos"))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !repos_resp.status().is_success() {
            return Err(format!(
                "Failed to list repos: HTTP {}",
                repos_resp.status()
            ));
        }

        let repo_list: RepoListResponse = repos_resp.json().await.map_err(|e| e.to_string())?;
        let repo_id = repo_list.data.first().ok_or("No repos configured")?.id;

        #[derive(serde::Serialize)]
        #[serde(rename_all = "camelCase")]
        struct AutoStartRequest {
            name: Option<String>,
            repos: Vec<RepoInput>,
            executor_config: serde_json::Value,
            prompt: String,
            attachment_ids: Option<Vec<uuid::Uuid>>,
        }
        #[derive(serde::Serialize)]
        #[serde(rename_all = "camelCase")]
        struct RepoInput {
            repo_id: uuid::Uuid,
            target_branch: String,
        }

        let prompt = build_workspace_prompt(title, description, comments);
        let payload = AutoStartRequest {
            name: Some(title.to_string()),
            repos: vec![RepoInput {
                repo_id,
                target_branch: branch.to_string(),
            }],
            executor_config: serde_json::json!({"type": "Claude"}),
            prompt,
            attachment_ids: None,
        };

        let resp = reqwest::Client::new()
            .post(format!("{local_url}/workspaces/start"))
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Failed to start workspace: HTTP {status}: {body}"));
        }

        info!(%issue_id, branch, "Workspace auto-started successfully");
        Ok(())
    }

    async fn mark_analyzed(&self, issue_id: Uuid) -> Result<(), String> {
        let token = self
            .remote_client
            .access_token()
            .await
            .map_err(|e| e.to_string())?;

        let base = self.remote_client.base_url();
        let base = if base.ends_with('/') {
            base.to_string()
        } else {
            format!("{base}/")
        };
        let url = format!("{base}v1/linear/issues/{issue_id}/mark-analyzed");

        let resp = reqwest::Client::new()
            .post(&url)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status()));
        }
        Ok(())
    }
}

fn parse_impact_score(analysis: &str) -> Option<u32> {
    // Looks for "**Impact Score: XX/100**" anywhere in the text
    for line in analysis.lines() {
        let line = line.trim();
        if let Some(rest) = line.trim_matches('*').trim().strip_prefix("Impact Score:") {
            let rest = rest.trim().trim_matches('*').trim();
            if let Some(score_str) = rest.split('/').next()
                && let Ok(score) = score_str.trim().parse::<u32>()
            {
                return Some(score);
            }
        }
    }
    None
}

fn build_prompt(title: &str, description: Option<&str>, comments: &[String]) -> String {
    let desc_section = description
        .filter(|d| !d.trim().is_empty())
        .map(|d| format!("\n\nDescription:\n{d}"))
        .unwrap_or_default();

    let comments_section = if comments.is_empty() {
        String::new()
    } else {
        let joined = comments
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{}. {c}", i + 1))
            .collect::<Vec<_>>()
            .join("\n");
        format!("\n\nComments:\n{joined}")
    };

    format!(
        "You are analyzing a software issue to determine its impact on the codebase.\n\
        \n\
        Issue title: {title}{desc_section}{comments_section}\n\
        \n\
        Using the GitNexus MCP tools available to you:\n\
        1. Read the repo context first\n\
        2. Use the `query` or `impact` tool to analyze what parts of the codebase are affected by this issue\n\
        3. Provide a concise impact analysis including:\n\
           - Affected components/files\n\
           - Blast radius (what could break)\n\
           - Suggested approach\n\
           - Impact score (Low/Medium/High/Critical)\n\
        \n\
        Keep the response concise and actionable. Always end with a line: **Impact Score: XX/100**"
    )
}

fn build_workspace_prompt(title: &str, description: Option<&str>, comments: &[String]) -> String {
    let desc_section = description
        .filter(|d| !d.trim().is_empty())
        .map(|d| format!("\n\nDescription:\n{d}"))
        .unwrap_or_default();

    let comments_section = if comments.is_empty() {
        String::new()
    } else {
        let joined = comments
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{}. {c}", i + 1))
            .collect::<Vec<_>>()
            .join("\n");
        format!("\n\nComments:\n{joined}")
    };

    format!("Work on: {title}{desc_section}{comments_section}")
}

fn gitnexus_mcp_config_arg() -> String {
    // Inline JSON config for the GitNexus MCP server
    r#"{"mcpServers":{"gitnexus":{"command":"npx","args":["-y","gitnexus@latest","mcp"]}}}"#
        .to_string()
}
