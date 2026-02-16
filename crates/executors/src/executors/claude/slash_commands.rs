use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::Stdio,
    sync::OnceLock,
    time::Duration,
};

use command_group::AsyncCommandGroup;
use convert_case::{Case, Casing};
use tokio::{
    fs,
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};

use super::{ClaudeCode, ClaudeJson, ClaudePlugin, base_command};
use crate::{
    command::{CommandBuildError, CommandBuilder, apply_overrides},
    env::{ExecutionEnv, RepoContext},
    executors::{ExecutorError, SlashCommandDescription},
    model_selector::AgentInfo,
};

const SLASH_COMMANDS_DISCOVERY_TIMEOUT: Duration = Duration::from_secs(120);

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

        // Project specific
        descriptions.extend(Self::scan_base_path(&current_dir.join(".claude"), None).await);

        // Global
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
        KNOWN_SLASH_COMMANDS.get_or_init(|| {
            vec![
                SlashCommandDescription {
                    name: "compact".to_string(),
                    description: Some(
                        "Clear conversation history but keep a summary in context. Optional: /compact [instructions for summarization]"
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
                        "Initialize a new CLAUDE.md file with codebase documentation".to_string(),
                    ),
                },
                SlashCommandDescription {
                    name: "pr-comments".to_string(),
                    description: Some("Get comments from a GitHub pull request".to_string()),
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
        }).clone()
    }

    async fn build_slash_commands_discovery_command_builder(
        &self,
    ) -> Result<CommandBuilder, CommandBuildError> {
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
        let command_builder = self
            .build_slash_commands_discovery_command_builder()
            .await?;
        let command_parts = command_builder.build_initial()?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .current_dir(current_dir)
            .args(&args);

        ExecutionEnv::new(RepoContext::default(), false, String::new())
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

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
                if let Ok(json) = serde_json::from_str::<ClaudeJson>(&line)
                    && let ClaudeJson::System {
                        subtype,
                        slash_commands,
                        plugins,
                        agents,
                        ..
                    } = &json
                    && matches!(subtype.as_deref(), Some("init"))
                {
                    discovered = Some((slash_commands.clone(), plugins.clone(), agents.clone()));
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
                return Err(ExecutorError::Io(std::io::Error::other(
                    "Timed out discovering Claude Code slash commands",
                )));
            }
        };

        Ok(result)
    }

    pub async fn discover_available_slash_commands(
        &self,
        current_dir: &Path,
    ) -> Result<Vec<SlashCommandDescription>, ExecutorError> {
        let (names, plugins, _) = self
            .discover_available_command_and_plugins(current_dir)
            .await?;

        let descriptions = Self::discover_custom_command_descriptions(current_dir, &plugins).await;

        let builtin: HashSet<String> = Self::hardcoded_slash_commands()
            .iter()
            .map(|c| c.name.clone())
            .collect();

        let mut seen = HashSet::new();
        let names = names
            .into_iter()
            .filter(|name| !name.is_empty() && !builtin.contains(name) && seen.insert(name.clone()))
            .collect::<Vec<_>>();

        let commands: Vec<SlashCommandDescription> = names
            .into_iter()
            .map(|name| SlashCommandDescription {
                name: name.to_string(),
                description: descriptions.get(&name).cloned(),
            })
            .collect();

        Ok(commands)
    }

    pub async fn discover_available_agents(
        &self,
        current_dir: &Path,
    ) -> Result<Vec<AgentInfo>, ExecutorError> {
        let (_, _, agents) = self
            .discover_available_command_and_plugins(current_dir)
            .await?;

        Ok(Self::map_discovered_agents(agents))
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
                    .or(cmd.description.clone()),
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
