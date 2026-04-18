use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::Stdio,
    sync::OnceLock,
    time::Duration,
};

use command_group::AsyncCommandGroup;
use convert_case::{Case, Casing};
use serde::{Deserialize, Serialize};
use tokio::{
    fs,
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};
use ts_rs::TS;

use super::{ClaudeCode, ClaudeJson, ClaudePlugin, base_command};
use crate::{
    command::{CommandBuilder, apply_overrides},
    executors::{ExecutorError, SlashCommandDescription},
};

const SLASH_COMMANDS_DISCOVERY_TIMEOUT: Duration = Duration::from_secs(120);

/// A discovered Claude Code agent (sub-agent type).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct AgentInfo {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub is_default: bool,
}

impl ClaudeCode {
    fn extract_description(content: &str) -> Option<String> {
        if !content.starts_with("---") {
            return None;
        }

        // Find end of frontmatter
        let end = content[3..].find("---")?;
        let frontmatter = &content[3..3 + end];

        for line in frontmatter.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("description:") {
                return Some(rest.trim().to_string());
            }
        }
        None
    }

    fn make_key(prefix: &Option<String>, name: &str) -> String {
        prefix
            .as_ref()
            .map(|p| format!("{}:{}", p, name))
            .unwrap_or_else(|| name.to_string())
    }

    async fn try_read_description(path: &Path) -> Option<String> {
        match fs::read_to_string(path).await {
            Ok(content) => Self::extract_description(&content).or_else(|| {
                tracing::warn!("Failed to read frontmatter description from {:?}", path);
                None
            }),
            Err(e) => {
                tracing::error!("Failed to read file {:?}: {}", path, e);
                None
            }
        }
    }

    async fn scan_dir(
        dir: &Path,
        prefix: &Option<String>,
        get_entry: fn(&Path) -> Option<(&str, PathBuf)>,
    ) -> HashMap<String, String> {
        let mut result = HashMap::new();
        if let Ok(mut entries) = fs::read_dir(dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Some((name, desc_path)) = get_entry(&entry.path())
                    && let Some(desc) = Self::try_read_description(&desc_path).await
                {
                    result.insert(Self::make_key(prefix, name), desc);
                }
            }
        }
        result
    }

    async fn scan_base_path(base_path: &Path, prefix: Option<String>) -> HashMap<String, String> {
        let mut descriptions = HashMap::new();

        descriptions.extend(
            Self::scan_dir(&base_path.join("commands"), &prefix, |path| {
                path.extension()
                    .is_some_and(|ext| ext == "md")
                    .then(|| {
                        let name = path.file_stem()?.to_str()?;
                        Some((name, path.to_path_buf()))
                    })
                    .flatten()
            })
            .await,
        );

        descriptions.extend(
            Self::scan_dir(&base_path.join("skills"), &prefix, |path| {
                path.is_dir()
                    .then(|| {
                        let name = path.file_name()?.to_str()?;
                        let skill_md = path.join("SKILL.md");
                        skill_md.exists().then_some((name, skill_md))
                    })
                    .flatten()
            })
            .await,
        );

        descriptions
    }

    pub async fn discover_custom_command_descriptions(
        current_dir: &Path,
        plugins: &[ClaudePlugin],
    ) -> HashMap<String, String> {
        let mut descriptions = HashMap::new();

        // Project-specific (.claude/ in worktree)
        descriptions.extend(Self::scan_base_path(&current_dir.join(".claude"), None).await);

        // Global (~/.claude/)
        if let Some(home) = dirs::home_dir() {
            descriptions.extend(Self::scan_base_path(&home.join(".claude"), None).await);
        }

        // Plugins
        for plugin in plugins {
            descriptions
                .extend(Self::scan_base_path(&plugin.path, Some(plugin.name.clone())).await);
            descriptions.extend(
                Self::scan_base_path(&plugin.path.join(".claude"), Some(plugin.name.clone())).await,
            );
        }

        descriptions
    }

    pub(super) fn hardcoded_slash_commands() -> Vec<SlashCommandDescription> {
        static KNOWN_SLASH_COMMANDS: OnceLock<Vec<SlashCommandDescription>> = OnceLock::new();
        KNOWN_SLASH_COMMANDS
            .get_or_init(|| {
                vec![
                    SlashCommandDescription {
                        name: "compact".to_string(),
                        description: Some(
                            "Clear conversation history but keep a summary in context. \
                             Optional: /compact [instructions for summarization]"
                                .to_string(),
                        ),
                    },
                    SlashCommandDescription {
                        name: "review".to_string(),
                        description: Some("Review a pull request".to_string()),
                    },
                    SlashCommandDescription {
                        name: "security-review".to_string(),
                        description: Some(
                            "Complete a security review of the pending changes on the current branch"
                                .to_string(),
                        ),
                    },
                    SlashCommandDescription {
                        name: "init".to_string(),
                        description: Some(
                            "Initialize a new CLAUDE.md file with codebase documentation"
                                .to_string(),
                        ),
                    },
                    SlashCommandDescription {
                        name: "pr-comments".to_string(),
                        description: Some(
                            "Get comments from a GitHub pull request".to_string(),
                        ),
                    },
                    SlashCommandDescription {
                        name: "context".to_string(),
                        description: Some(
                            "Visualize current context usage as a colored grid".to_string(),
                        ),
                    },
                    SlashCommandDescription {
                        name: "cost".to_string(),
                        description: Some(
                            "Show the total cost and duration of the current session".to_string(),
                        ),
                    },
                    SlashCommandDescription {
                        name: "release-notes".to_string(),
                        description: Some("View release notes".to_string()),
                    },
                ]
            })
            .clone()
    }

    async fn build_slash_commands_discovery_command_builder(&self) -> CommandBuilder {
        let mut builder =
            CommandBuilder::new(base_command(self.claude_code_router.unwrap_or(false)))
                .params(["-p"]);

        builder = builder.extend_params([
            "--verbose",
            "--output-format=stream-json",
            "--max-turns",
            "1",
            "--",
            "/",
        ]);

        apply_overrides(builder, &self.cmd)
    }

    async fn discover_available_command_and_plugins(
        &self,
        current_dir: &Path,
    ) -> Result<(Vec<String>, Vec<ClaudePlugin>, Vec<String>), ExecutorError> {
        let builder = self.build_slash_commands_discovery_command_builder().await;
        let command_parts = builder.build_initial()?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .current_dir(current_dir)
            .args(&args);

        // Apply the same env cleanup as spawn_internal (no VK context vars needed here)
        command.env_remove("npm_config__jsr_registry");
        command.env_remove("npm_config_verify_deps_before_run");
        command.env_remove("npm_config_globalconfig");
        command
            .env("DISABLE_AUTOUPDATER", "1")
            .env("DISABLE_TELEMETRY", "1")
            .env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1")
            .env("DISABLE_COST_WARNINGS", "1");

        if self.disable_api_key.unwrap_or(false) {
            command.env_remove("ANTHROPIC_API_KEY");
        }

        let mut child = command.group_spawn()?;
        let stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Claude Code missing stdout"))
        })?;

        let mut lines = BufReader::new(stdout).lines();
        let mut discovered: Option<(Vec<String>, Vec<ClaudePlugin>, Vec<String>)> = None;

        let discovery = async {
            while let Some(line) = lines.next_line().await.map_err(ExecutorError::Io)? {
                if let Ok(ClaudeJson::System {
                    subtype,
                    slash_commands,
                    plugins,
                    agents,
                    ..
                }) = serde_json::from_str::<ClaudeJson>(&line)
                    && matches!(subtype.as_deref(), Some("init"))
                {
                    discovered = Some((slash_commands, plugins, agents));
                    break;
                }
            }
            Ok::<(), ExecutorError>(())
        };

        let res = tokio::time::timeout(SLASH_COMMANDS_DISCOVERY_TIMEOUT, discovery).await;
        let _ = child.kill().await;

        let result = match res {
            Ok(Ok(())) => discovered.unwrap_or_else(|| (vec![], vec![], vec![])),
            Ok(Err(e)) => return Err(e),
            Err(_) => {
                tracing::warn!("Timed out discovering Claude Code slash commands");
                (vec![], vec![], vec![])
            }
        };

        Ok(result)
    }

    pub async fn discover_agents_and_slash_commands_initial(
        &self,
        current_dir: &Path,
    ) -> Result<
        (
            Vec<AgentInfo>,
            Vec<SlashCommandDescription>,
            Vec<ClaudePlugin>,
        ),
        ExecutorError,
    > {
        let (names, plugins, agents) = self
            .discover_available_command_and_plugins(current_dir)
            .await?;

        let agent_options = Self::map_discovered_agents(agents);

        let builtin: HashSet<String> = Self::hardcoded_slash_commands()
            .iter()
            .map(|c| c.name.clone())
            .collect();

        let mut seen = HashSet::new();
        let slash_commands: Vec<SlashCommandDescription> = names
            .into_iter()
            .filter(|name| !name.is_empty() && !builtin.contains(name) && seen.insert(name.clone()))
            .map(|name| SlashCommandDescription {
                name,
                description: None,
            })
            .collect();

        Ok((agent_options, slash_commands, plugins))
    }

    pub async fn fill_slash_command_descriptions(
        current_dir: &Path,
        plugins: &[ClaudePlugin],
        slash_commands: &[SlashCommandDescription],
    ) -> Vec<SlashCommandDescription> {
        let descriptions = Self::discover_custom_command_descriptions(current_dir, plugins).await;

        slash_commands
            .iter()
            .map(|cmd| SlashCommandDescription {
                name: cmd.name.clone(),
                description: descriptions
                    .get(&cmd.name)
                    .cloned()
                    .or_else(|| cmd.description.clone()),
            })
            .collect()
    }

    fn map_discovered_agents(agents: Vec<String>) -> Vec<AgentInfo> {
        let mut seen = HashSet::new();

        agents
            .into_iter()
            .filter(|name| name != "statusline-setup")
            .filter_map(|name| {
                let option = AgentInfo {
                    id: name.clone(),
                    label: Self::format_agent_label(&name),
                    description: None,
                    is_default: name == "general-purpose",
                };
                if option.id.trim().is_empty() || !seen.insert(option.id.clone()) {
                    return None;
                }
                Some(option)
            })
            .collect()
    }

    fn format_agent_label(raw: &str) -> String {
        let raw = raw.trim();
        if let Some((prefix, suffix)) = raw.split_once(':') {
            format!("{}: {}", prefix.trim(), suffix.to_case(Case::Title))
        } else {
            raw.to_case(Case::Title)
        }
    }
}
