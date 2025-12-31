//! Minimal helpers around the GitHub CLI (`gh`).
//!
//! This module deliberately mirrors the ergonomics of `git_cli.rs` so we can
//! plug in the GitHub CLI for operations the REST client does not cover well.
//! Future work will flesh out richer error handling and testing.

use std::{
    ffi::{OsStr, OsString},
    io::Write,
    process::Command,
};

use tempfile::NamedTempFile;

use chrono::{DateTime, Utc};
use db::models::merge::{MergeStatus, PullRequestInfo};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use ts_rs::TS;
use utils::shell::resolve_executable_path_blocking;

use crate::services::github::{CreatePrRequest, GitHubRepoInfo};

/// Author information for a PR comment
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PrCommentAuthor {
    pub login: String,
}

/// A single comment on a GitHub PR
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PrComment {
    pub id: String,
    pub author: PrCommentAuthor,
    pub author_association: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub url: String,
}

/// User information for a review comment (from API response)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ReviewCommentUser {
    pub login: String,
}

/// An inline review comment on a GitHub PR (from gh api)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PrReviewComment {
    pub id: i64,
    pub user: ReviewCommentUser,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub html_url: String,
    pub path: String,
    pub line: Option<i64>,
    pub side: Option<String>,
    pub diff_hunk: String,
    pub author_association: String,
}

/// High-level errors originating from the GitHub CLI.
#[derive(Debug, Error)]
pub enum GhCliError {
    #[error("GitHub CLI (`gh`) executable not found or not runnable")]
    NotAvailable,
    #[error("GitHub CLI command failed: {0}")]
    CommandFailed(String),
    #[error("GitHub CLI authentication failed: {0}")]
    AuthFailed(String),
    #[error("GitHub CLI returned unexpected output: {0}")]
    UnexpectedOutput(String),
}

/// Prepared arguments for `gh pr create` command.
/// Holds the args and an optional temp file that must outlive the command execution.
struct PreparedPrCreateArgs {
    args: Vec<OsString>,
    /// Temp file for body content; must be kept alive while args reference its path.
    _temp_file: Option<NamedTempFile>,
}

/// Newtype wrapper for invoking the `gh` command.
#[derive(Debug, Clone, Default)]
pub struct GhCli;

impl GhCli {
    pub fn new() -> Self {
        Self {}
    }

    /// Ensure the GitHub CLI binary is discoverable.
    fn ensure_available(&self) -> Result<(), GhCliError> {
        resolve_executable_path_blocking("gh").ok_or(GhCliError::NotAvailable)?;
        Ok(())
    }

    /// Generic helper to execute `gh <args>` and return stdout on success.
    fn run<I, S>(&self, args: I) -> Result<String, GhCliError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.ensure_available()?;
        let gh = resolve_executable_path_blocking("gh").ok_or(GhCliError::NotAvailable)?;
        let mut cmd = Command::new(&gh);
        for arg in args {
            cmd.arg(arg);
        }
        let output = cmd
            .output()
            .map_err(|err| GhCliError::CommandFailed(err.to_string()))?;

        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        // Check exit code first - gh CLI uses exit code 4 for auth failures
        if output.status.code() == Some(4) {
            return Err(GhCliError::AuthFailed(stderr));
        }

        // Fall back to string matching for older gh versions or other auth scenarios
        let lower = stderr.to_ascii_lowercase();
        if lower.contains("authentication failed")
            || lower.contains("must authenticate")
            || lower.contains("bad credentials")
            || lower.contains("unauthorized")
            || lower.contains("gh auth login")
        {
            return Err(GhCliError::AuthFailed(stderr));
        }

        Err(GhCliError::CommandFailed(stderr))
    }

    /// Run `gh pr create` and parse the response.
    ///
    /// Uses `--body-file` for large or multi-line bodies to avoid shell escaping
    /// issues and command-line length limits.
    pub fn create_pr(
        &self,
        request: &CreatePrRequest,
        repo_info: &GitHubRepoInfo,
    ) -> Result<PullRequestInfo, GhCliError> {
        let prepared = Self::prepare_pr_create_args(request, repo_info)?;
        let raw = self.run(prepared.args)?;
        Self::parse_pr_create_text(&raw)
    }

    /// Prepare arguments for `gh pr create`, handling body-file logic.
    /// Returns the args and an optional temp file that must be kept alive during command execution.
    fn prepare_pr_create_args(
        request: &CreatePrRequest,
        repo_info: &GitHubRepoInfo,
    ) -> Result<PreparedPrCreateArgs, GhCliError> {
        let body = request.body.as_deref().unwrap_or("");
        let use_body_file = Self::should_use_body_file(body);

        let temp_file = if use_body_file {
            let mut file = NamedTempFile::new().map_err(|err| {
                GhCliError::CommandFailed(format!("Failed to create temp file for PR body: {err}"))
            })?;
            file.write_all(body.as_bytes()).map_err(|err| {
                GhCliError::CommandFailed(format!("Failed to write PR body to temp file: {err}"))
            })?;
            file.flush().map_err(|err| {
                GhCliError::CommandFailed(format!("Failed to flush PR body temp file: {err}"))
            })?;
            Some(file)
        } else {
            None
        };

        let mut args: Vec<OsString> = Vec::with_capacity(12);
        args.push(OsString::from("pr"));
        args.push(OsString::from("create"));
        args.push(OsString::from("--repo"));
        args.push(OsString::from(format!(
            "{}/{}",
            repo_info.owner, repo_info.repo_name
        )));
        args.push(OsString::from("--head"));
        args.push(OsString::from(&request.head_branch));
        args.push(OsString::from("--base"));
        args.push(OsString::from(&request.base_branch));
        args.push(OsString::from("--title"));
        args.push(OsString::from(&request.title));

        if let Some(ref file) = temp_file {
            args.push(OsString::from("--body-file"));
            args.push(file.path().as_os_str().to_os_string());
        } else {
            args.push(OsString::from("--body"));
            args.push(OsString::from(body));
        }

        if request.draft.unwrap_or(false) {
            args.push(OsString::from("--draft"));
        }

        Ok(PreparedPrCreateArgs {
            args,
            _temp_file: temp_file,
        })
    }

    /// Ensure the GitHub CLI has valid auth.
    pub fn check_auth(&self) -> Result<(), GhCliError> {
        match self.run(["auth", "status"]) {
            Ok(_) => Ok(()),
            Err(GhCliError::CommandFailed(msg)) => Err(GhCliError::AuthFailed(msg)),
            Err(err) => Err(err),
        }
    }

    /// Retrieve details for a single pull request.
    pub fn view_pr(
        &self,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<PullRequestInfo, GhCliError> {
        let raw = self.run([
            "pr",
            "view",
            &pr_number.to_string(),
            "--repo",
            &format!("{owner}/{repo}"),
            "--json",
            "number,url,state,mergedAt,mergeCommit",
        ])?;
        Self::parse_pr_view(&raw)
    }

    /// List pull requests for a branch (includes closed/merged).
    pub fn list_prs_for_branch(
        &self,
        owner: &str,
        repo: &str,
        branch: &str,
    ) -> Result<Vec<PullRequestInfo>, GhCliError> {
        let raw = self.run([
            "pr",
            "list",
            "--repo",
            &format!("{owner}/{repo}"),
            "--state",
            "all",
            "--head",
            &format!("{owner}:{branch}"),
            "--json",
            "number,url,state,mergedAt,mergeCommit",
        ])?;
        Self::parse_pr_list(&raw)
    }

    /// Fetch comments for a pull request.
    pub fn get_pr_comments(
        &self,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<Vec<PrComment>, GhCliError> {
        let raw = self.run([
            "pr",
            "view",
            &pr_number.to_string(),
            "--repo",
            &format!("{owner}/{repo}"),
            "--json",
            "comments",
        ])?;
        Self::parse_pr_comments(&raw)
    }

    /// Fetch inline review comments for a pull request via API.
    pub fn get_pr_review_comments(
        &self,
        owner: &str,
        repo: &str,
        pr_number: i64,
    ) -> Result<Vec<PrReviewComment>, GhCliError> {
        let raw = self.run([
            "api",
            &format!("repos/{owner}/{repo}/pulls/{pr_number}/comments"),
        ])?;
        Self::parse_pr_review_comments(&raw)
    }
}

impl GhCli {
    /// Threshold for using --body-file instead of --body
    const BODY_FILE_THRESHOLD: usize = 1000;

    /// Determine whether to use --body-file for PR body content.
    /// Returns true if body is long (>1000 chars) or contains newlines.
    fn should_use_body_file(body: &str) -> bool {
        body.len() > Self::BODY_FILE_THRESHOLD || body.contains('\n')
    }

    fn parse_pr_create_text(raw: &str) -> Result<PullRequestInfo, GhCliError> {
        let pr_url = raw
            .lines()
            .rev()
            .flat_map(|line| line.split_whitespace())
            .map(|token| token.trim_matches(|c: char| c == '<' || c == '>'))
            .find(|token| token.starts_with("http") && token.contains("/pull/"))
            .ok_or_else(|| {
                GhCliError::UnexpectedOutput(format!(
                    "gh pr create did not return a pull request URL; raw output: {raw}"
                ))
            })?
            .trim_end_matches(['.', ',', ';'])
            .to_string();

        let number = pr_url
            .rsplit('/')
            .next()
            .ok_or_else(|| {
                GhCliError::UnexpectedOutput(format!(
                    "Failed to extract PR number from URL '{pr_url}'"
                ))
            })?
            .trim_end_matches(|c: char| !c.is_ascii_digit())
            .parse::<i64>()
            .map_err(|err| {
                GhCliError::UnexpectedOutput(format!(
                    "Failed to parse PR number from URL '{pr_url}': {err}"
                ))
            })?;

        Ok(PullRequestInfo {
            number,
            url: pr_url,
            status: MergeStatus::Open,
            merged_at: None,
            merge_commit_sha: None,
        })
    }

    fn parse_pr_view(raw: &str) -> Result<PullRequestInfo, GhCliError> {
        let value: Value = serde_json::from_str(raw.trim()).map_err(|err| {
            GhCliError::UnexpectedOutput(format!(
                "Failed to parse gh pr view response: {err}; raw: {raw}"
            ))
        })?;
        Self::extract_pr_info(&value).ok_or_else(|| {
            GhCliError::UnexpectedOutput(format!(
                "gh pr view response missing required fields: {value:#?}"
            ))
        })
    }

    fn parse_pr_list(raw: &str) -> Result<Vec<PullRequestInfo>, GhCliError> {
        let value: Value = serde_json::from_str(raw.trim()).map_err(|err| {
            GhCliError::UnexpectedOutput(format!(
                "Failed to parse gh pr list response: {err}; raw: {raw}"
            ))
        })?;
        let arr = value.as_array().ok_or_else(|| {
            GhCliError::UnexpectedOutput(format!("gh pr list response is not an array: {value:#?}"))
        })?;
        arr.iter()
            .map(|item| {
                Self::extract_pr_info(item).ok_or_else(|| {
                    GhCliError::UnexpectedOutput(format!(
                        "gh pr list item missing required fields: {item:#?}"
                    ))
                })
            })
            .collect()
    }

    fn parse_pr_comments(raw: &str) -> Result<Vec<PrComment>, GhCliError> {
        let value: Value = serde_json::from_str(raw.trim()).map_err(|err| {
            GhCliError::UnexpectedOutput(format!(
                "Failed to parse gh pr view --json comments response: {err}; raw: {raw}"
            ))
        })?;

        let comments_arr = value
            .get("comments")
            .and_then(|v| v.as_array())
            .ok_or_else(|| {
                GhCliError::UnexpectedOutput(format!(
                    "gh pr view --json comments response missing 'comments' array: {value:#?}"
                ))
            })?;

        comments_arr
            .iter()
            .map(|item| {
                serde_json::from_value(item.clone()).map_err(|err| {
                    GhCliError::UnexpectedOutput(format!(
                        "Failed to parse PR comment: {err}; item: {item:#?}"
                    ))
                })
            })
            .collect()
    }

    fn parse_pr_review_comments(raw: &str) -> Result<Vec<PrReviewComment>, GhCliError> {
        serde_json::from_str(raw.trim()).map_err(|err| {
            GhCliError::UnexpectedOutput(format!(
                "Failed to parse review comments API response: {err}; raw: {raw}"
            ))
        })
    }

    fn extract_pr_info(value: &Value) -> Option<PullRequestInfo> {
        let number = value.get("number")?.as_i64()?;
        let url = value.get("url")?.as_str()?.to_string();
        let state = value
            .get("state")
            .and_then(Value::as_str)
            .unwrap_or("OPEN")
            .to_string();
        let merged_at = value
            .get("mergedAt")
            .and_then(Value::as_str)
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc));
        let merge_commit_sha = value
            .get("mergeCommit")
            .and_then(|v| v.get("oid"))
            .and_then(Value::as_str)
            .map(|s| s.to_string());
        Some(PullRequestInfo {
            number,
            url,
            status: match state.to_ascii_uppercase().as_str() {
                "OPEN" => MergeStatus::Open,
                "MERGED" => MergeStatus::Merged,
                "CLOSED" => MergeStatus::Closed,
                _ => MergeStatus::Unknown,
            },
            merged_at,
            merge_commit_sha,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== parse_pr_create_text tests ====================

    #[test]
    fn test_parse_pr_create_text_simple_url() {
        let raw = "https://github.com/owner/repo/pull/123\n";
        let result = GhCli::parse_pr_create_text(raw).unwrap();
        assert_eq!(result.number, 123);
        assert_eq!(result.url, "https://github.com/owner/repo/pull/123");
        assert!(matches!(result.status, MergeStatus::Open));
    }

    #[test]
    fn test_parse_pr_create_text_with_message() {
        let raw = "Creating pull request for feature-branch into main\nhttps://github.com/owner/repo/pull/456\n";
        let result = GhCli::parse_pr_create_text(raw).unwrap();
        assert_eq!(result.number, 456);
        assert_eq!(result.url, "https://github.com/owner/repo/pull/456");
    }

    #[test]
    fn test_parse_pr_create_text_url_with_angle_brackets() {
        let raw = "Pull request created: <https://github.com/owner/repo/pull/789>\n";
        let result = GhCli::parse_pr_create_text(raw).unwrap();
        assert_eq!(result.number, 789);
        assert_eq!(result.url, "https://github.com/owner/repo/pull/789");
    }

    #[test]
    fn test_parse_pr_create_text_url_with_trailing_punctuation() {
        let raw = "Created: https://github.com/owner/repo/pull/101.\n";
        let result = GhCli::parse_pr_create_text(raw).unwrap();
        assert_eq!(result.number, 101);
        assert_eq!(result.url, "https://github.com/owner/repo/pull/101");
    }

    #[test]
    fn test_parse_pr_create_text_no_url() {
        let raw = "Some output without a URL";
        let result = GhCli::parse_pr_create_text(raw);
        assert!(result.is_err());
        assert!(matches!(result, Err(GhCliError::UnexpectedOutput(_))));
    }

    #[test]
    fn test_parse_pr_create_text_large_pr_number() {
        let raw = "https://github.com/org/project/pull/99999\n";
        let result = GhCli::parse_pr_create_text(raw).unwrap();
        assert_eq!(result.number, 99999);
    }

    // ==================== parse_pr_view tests ====================

    #[test]
    fn test_parse_pr_view_open() {
        let raw = r#"{"number":42,"url":"https://github.com/o/r/pull/42","state":"OPEN"}"#;
        let result = GhCli::parse_pr_view(raw).unwrap();
        assert_eq!(result.number, 42);
        assert_eq!(result.url, "https://github.com/o/r/pull/42");
        assert!(matches!(result.status, MergeStatus::Open));
        assert!(result.merged_at.is_none());
        assert!(result.merge_commit_sha.is_none());
    }

    #[test]
    fn test_parse_pr_view_merged() {
        let raw = r#"{
            "number": 100,
            "url": "https://github.com/o/r/pull/100",
            "state": "MERGED",
            "mergedAt": "2024-01-15T10:30:00Z",
            "mergeCommit": {"oid": "abc123def456"}
        }"#;
        let result = GhCli::parse_pr_view(raw).unwrap();
        assert_eq!(result.number, 100);
        assert!(matches!(result.status, MergeStatus::Merged));
        assert!(result.merged_at.is_some());
        assert_eq!(result.merge_commit_sha, Some("abc123def456".to_string()));
    }

    #[test]
    fn test_parse_pr_view_closed() {
        let raw = r#"{"number":50,"url":"https://github.com/o/r/pull/50","state":"CLOSED"}"#;
        let result = GhCli::parse_pr_view(raw).unwrap();
        assert!(matches!(result.status, MergeStatus::Closed));
    }

    #[test]
    fn test_parse_pr_view_missing_number() {
        let raw = r#"{"url":"https://github.com/o/r/pull/1","state":"OPEN"}"#;
        let result = GhCli::parse_pr_view(raw);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_pr_view_invalid_json() {
        let raw = "not valid json";
        let result = GhCli::parse_pr_view(raw);
        assert!(result.is_err());
    }

    // ==================== parse_pr_list tests ====================

    #[test]
    fn test_parse_pr_list_empty() {
        let raw = "[]";
        let result = GhCli::parse_pr_list(raw).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_pr_list_single() {
        let raw = r#"[{"number":1,"url":"https://github.com/o/r/pull/1","state":"OPEN"}]"#;
        let result = GhCli::parse_pr_list(raw).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].number, 1);
    }

    #[test]
    fn test_parse_pr_list_multiple() {
        let raw = r#"[
            {"number":1,"url":"https://github.com/o/r/pull/1","state":"OPEN"},
            {"number":2,"url":"https://github.com/o/r/pull/2","state":"MERGED","mergedAt":"2024-01-01T00:00:00Z"},
            {"number":3,"url":"https://github.com/o/r/pull/3","state":"CLOSED"}
        ]"#;
        let result = GhCli::parse_pr_list(raw).unwrap();
        assert_eq!(result.len(), 3);
        assert!(matches!(result[0].status, MergeStatus::Open));
        assert!(matches!(result[1].status, MergeStatus::Merged));
        assert!(matches!(result[2].status, MergeStatus::Closed));
    }

    #[test]
    fn test_parse_pr_list_not_array() {
        let raw = r#"{"number":1}"#;
        let result = GhCli::parse_pr_list(raw);
        assert!(result.is_err());
    }

    // ==================== parse_pr_comments tests ====================

    #[test]
    fn test_parse_pr_comments_empty() {
        let raw = r#"{"comments":[]}"#;
        let result = GhCli::parse_pr_comments(raw).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_pr_comments_single() {
        let raw = r#"{
            "comments": [{
                "id": "IC_123",
                "author": {"login": "user1"},
                "authorAssociation": "MEMBER",
                "body": "LGTM!",
                "createdAt": "2024-01-15T10:00:00Z",
                "url": "https://github.com/o/r/pull/1#issuecomment-123"
            }]
        }"#;
        let result = GhCli::parse_pr_comments(raw).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "IC_123");
        assert_eq!(result[0].author.login, "user1");
        assert_eq!(result[0].body, "LGTM!");
    }

    #[test]
    fn test_parse_pr_comments_missing_comments_field() {
        let raw = r#"{"other_field": []}"#;
        let result = GhCli::parse_pr_comments(raw);
        assert!(result.is_err());
    }

    // ==================== parse_pr_review_comments tests ====================

    #[test]
    fn test_parse_pr_review_comments_empty() {
        let raw = "[]";
        let result = GhCli::parse_pr_review_comments(raw).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_pr_review_comments_single() {
        let raw = r#"[{
            "id": 12345,
            "user": {"login": "reviewer"},
            "body": "Consider renaming this variable",
            "created_at": "2024-01-15T12:00:00Z",
            "html_url": "https://github.com/o/r/pull/1#discussion_r12345",
            "path": "src/main.rs",
            "line": 42,
            "side": "RIGHT",
            "diff_hunk": "@@ -40,3 +40,5 @@",
            "author_association": "COLLABORATOR"
        }]"#;
        let result = GhCli::parse_pr_review_comments(raw).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, 12345);
        assert_eq!(result[0].user.login, "reviewer");
        assert_eq!(result[0].path, "src/main.rs");
        assert_eq!(result[0].line, Some(42));
    }

    #[test]
    fn test_parse_pr_review_comments_null_line() {
        let raw = r#"[{
            "id": 1,
            "user": {"login": "u"},
            "body": "comment",
            "created_at": "2024-01-01T00:00:00Z",
            "html_url": "https://example.com",
            "path": "file.rs",
            "line": null,
            "side": null,
            "diff_hunk": "@@",
            "author_association": "NONE"
        }]"#;
        let result = GhCli::parse_pr_review_comments(raw).unwrap();
        assert_eq!(result.len(), 1);
        assert!(result[0].line.is_none());
        assert!(result[0].side.is_none());
    }

    #[test]
    fn test_parse_pr_review_comments_invalid_json() {
        let raw = "not json";
        let result = GhCli::parse_pr_review_comments(raw);
        assert!(result.is_err());
    }

    // ==================== extract_pr_info tests ====================

    #[test]
    fn test_extract_pr_info_unknown_state() {
        let value: Value = serde_json::json!({
            "number": 1,
            "url": "https://github.com/o/r/pull/1",
            "state": "DRAFT"
        });
        let result = GhCli::extract_pr_info(&value).unwrap();
        assert!(matches!(result.status, MergeStatus::Unknown));
    }

    #[test]
    fn test_extract_pr_info_default_state() {
        let value: Value = serde_json::json!({
            "number": 1,
            "url": "https://github.com/o/r/pull/1"
        });
        let result = GhCli::extract_pr_info(&value).unwrap();
        assert!(matches!(result.status, MergeStatus::Open));
    }

    // ==================== should_use_body_file tests ====================

    #[test]
    fn test_should_use_body_file_short_no_newline() {
        assert!(!GhCli::should_use_body_file("Short body"));
    }

    #[test]
    fn test_should_use_body_file_with_newline() {
        assert!(GhCli::should_use_body_file("Line 1\nLine 2"));
    }

    #[test]
    fn test_should_use_body_file_long_content() {
        let long_body = "x".repeat(1001);
        assert!(GhCli::should_use_body_file(&long_body));
    }

    #[test]
    fn test_should_use_body_file_at_threshold() {
        let at_threshold = "x".repeat(1000);
        assert!(!GhCli::should_use_body_file(&at_threshold));
    }

    #[test]
    fn test_should_use_body_file_empty() {
        assert!(!GhCli::should_use_body_file(""));
    }

    #[test]
    fn test_should_use_body_file_long_with_newline() {
        let long_with_newline = format!("{}\n{}", "a".repeat(500), "b".repeat(600));
        assert!(GhCli::should_use_body_file(&long_with_newline));
    }

    // ==================== prepare_pr_create_args tests ====================

    fn make_test_request(body: Option<&str>, draft: bool) -> CreatePrRequest {
        CreatePrRequest {
            head_branch: "feature".to_string(),
            base_branch: "main".to_string(),
            title: "Test PR".to_string(),
            body: body.map(|s| s.to_string()),
            draft: Some(draft),
        }
    }

    fn make_test_repo_info() -> GitHubRepoInfo {
        GitHubRepoInfo {
            owner: "owner".to_string(),
            repo_name: "repo".to_string(),
        }
    }

    fn args_to_strings(args: &[OsString]) -> Vec<String> {
        args.iter().map(|s| s.to_string_lossy().to_string()).collect()
    }

    #[test]
    fn test_prepare_args_short_body_uses_body_flag() {
        let request = make_test_request(Some("Short body"), false);
        let repo_info = make_test_repo_info();

        let prepared = GhCli::prepare_pr_create_args(&request, &repo_info).unwrap();
        let args = args_to_strings(&prepared.args);

        assert!(args.contains(&"--body".to_string()));
        assert!(!args.contains(&"--body-file".to_string()));
        assert!(args.contains(&"Short body".to_string()));
    }

    #[test]
    fn test_prepare_args_multiline_body_uses_body_file() {
        let request = make_test_request(Some("Line 1\nLine 2"), false);
        let repo_info = make_test_repo_info();

        let prepared = GhCli::prepare_pr_create_args(&request, &repo_info).unwrap();
        let args = args_to_strings(&prepared.args);

        assert!(args.contains(&"--body-file".to_string()));
        assert!(!args.contains(&"--body".to_string()));
        // Verify temp file exists and contains correct content
        assert!(prepared._temp_file.is_some());
        let content = std::fs::read_to_string(prepared._temp_file.as_ref().unwrap().path()).unwrap();
        assert_eq!(content, "Line 1\nLine 2");
    }

    #[test]
    fn test_prepare_args_long_body_uses_body_file() {
        let long_body = "x".repeat(1500);
        let request = make_test_request(Some(&long_body), false);
        let repo_info = make_test_repo_info();

        let prepared = GhCli::prepare_pr_create_args(&request, &repo_info).unwrap();
        let args = args_to_strings(&prepared.args);

        assert!(args.contains(&"--body-file".to_string()));
        // Verify temp file contains the full content
        let content = std::fs::read_to_string(prepared._temp_file.as_ref().unwrap().path()).unwrap();
        assert_eq!(content.len(), 1500);
    }

    #[test]
    fn test_prepare_args_includes_draft_flag() {
        let request = make_test_request(Some("body"), true);
        let repo_info = make_test_repo_info();

        let prepared = GhCli::prepare_pr_create_args(&request, &repo_info).unwrap();
        let args = args_to_strings(&prepared.args);

        assert!(args.contains(&"--draft".to_string()));
    }

    #[test]
    fn test_prepare_args_no_draft_flag_when_false() {
        let request = make_test_request(Some("body"), false);
        let repo_info = make_test_repo_info();

        let prepared = GhCli::prepare_pr_create_args(&request, &repo_info).unwrap();
        let args = args_to_strings(&prepared.args);

        assert!(!args.contains(&"--draft".to_string()));
    }

    #[test]
    fn test_prepare_args_correct_structure() {
        let request = make_test_request(Some("body"), false);
        let repo_info = make_test_repo_info();

        let prepared = GhCli::prepare_pr_create_args(&request, &repo_info).unwrap();
        let args = args_to_strings(&prepared.args);

        // Verify argument order and values
        assert_eq!(args[0], "pr");
        assert_eq!(args[1], "create");
        assert_eq!(args[2], "--repo");
        assert_eq!(args[3], "owner/repo");
        assert_eq!(args[4], "--head");
        assert_eq!(args[5], "feature");
        assert_eq!(args[6], "--base");
        assert_eq!(args[7], "main");
        assert_eq!(args[8], "--title");
        assert_eq!(args[9], "Test PR");
    }
}
