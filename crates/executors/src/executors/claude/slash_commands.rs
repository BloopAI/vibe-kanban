use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::Stdio,
    sync::OnceLock,
    time::Duration,
};

use command_group::AsyncCommandGroup;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};
use walkdir::WalkDir;

use super::{ClaudeCode, ClaudeJson, ClaudePlugin, base_command};
use crate::{
    command::{CommandBuildError, CommandBuilder, apply_overrides},
    env::{ExecutionEnv, RepoContext},
    executors::{
        BaseCodingAgent, ExecutorError, SlashCommandDescription,
        utils::{SlashCommandCache, SlashCommandCacheKey},
    },
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

    fn discover_custom_command_descriptions(
        current_dir: &Path,
        plugins: &[ClaudePlugin],
    ) -> HashMap<String, String> {
        let mut descriptions = HashMap::new();

        let mut scan = |base_path: PathBuf, prefix: Option<&str>| {
            // Commands: base_path/commands/*.md
            let commands_dir = base_path.join("commands");
            if commands_dir.exists() {
                for entry in WalkDir::new(&commands_dir)
                    .max_depth(1)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    let path = entry.path();
                    if path.is_file()
                        && path.extension().is_some_and(|ext| ext == "md")
                        && let Some(name) = path.file_stem().and_then(|s| s.to_str())
                        && let Ok(content) = std::fs::read_to_string(path)
                        && let Some(desc) = Self::extract_description(&content)
                    {
                        let key = if let Some(p) = prefix {
                            format!("{}:{}", p, name)
                        } else {
                            name.to_string()
                        };
                        descriptions.insert(key, desc);
                    }
                }
            }

            // Skills: base_path/skills/*/SKILL.md
            let skills_dir = base_path.join("skills");
            if skills_dir.exists() {
                for entry in WalkDir::new(&skills_dir)
                    .min_depth(2)
                    .max_depth(2)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    let path = entry.path();
                    if path.is_file() && path.file_name().is_some_and(|n| n == "SKILL.md") {
                        // Name is the parent directory name
                        if let Some(parent) = path
                            .parent()
                            .and_then(|p| p.file_name())
                            .and_then(|s| s.to_str())
                            && let Ok(content) = std::fs::read_to_string(path)
                            && let Some(desc) = Self::extract_description(&content)
                        {
                            let key = if let Some(p) = prefix {
                                format!("{}:{}", p, parent)
                            } else {
                                parent.to_string()
                            };
                            descriptions.insert(key, desc);
                        }
                    }
                }
            }
        };

        // Project specific
        scan(current_dir.join(".claude"), None);

        // Global
        if let Some(home) = dirs::home_dir() {
            scan(home.join(".claude"), None);
        }

        // Plugins
        for plugin in plugins {
            scan(plugin.path.clone(), Some(&plugin.name));
            scan(plugin.path.join(".claude"), Some(&plugin.name));
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
    ) -> Result<(Vec<String>, Vec<ClaudePlugin>), ExecutorError> {
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

        ExecutionEnv::new(RepoContext::default(), false)
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

        let mut discovered: Option<(Vec<String>, Vec<ClaudePlugin>)> = None;
        let discovery = async {
            while let Some(line) = lines.next_line().await.map_err(ExecutorError::Io)? {
                if let Ok(json) = serde_json::from_str::<ClaudeJson>(&line)
                    && let ClaudeJson::System {
                        subtype,
                        slash_commands,
                        plugins,
                        ..
                    } = &json
                    && matches!(subtype.as_deref(), Some("init"))
                {
                    discovered = Some((slash_commands.clone(), plugins.clone()));
                    break;
                }
            }

            Ok::<(), ExecutorError>(())
        };

        let res = tokio::time::timeout(SLASH_COMMANDS_DISCOVERY_TIMEOUT, discovery).await;
        let _ = child.kill().await;

        match res {
            Ok(Ok(())) => Ok(discovered.unwrap_or_else(|| (vec![], vec![]))),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(ExecutorError::Io(std::io::Error::other(
                "Timed out discovering Claude Code slash commands",
            ))),
        }
    }

    pub async fn discover_available_slash_commands(
        &self,
        current_dir: &Path,
    ) -> Result<Vec<SlashCommandDescription>, ExecutorError> {
        let key = SlashCommandCacheKey::new(current_dir, &BaseCodingAgent::ClaudeCode);
        if let Some(cached) = SlashCommandCache::instance().get(&key) {
            return Ok(cached.as_ref().clone());
        }

        // Run claude-code to discover commands and plugins
        let (names, plugins) = self
            .discover_available_command_and_plugins(current_dir)
            .await?;

        // Run file walk to discover command descriptions, including from plugins
        let current_dir_owned = current_dir.to_owned();
        let descriptions = tokio::task::spawn_blocking(move || {
            Self::discover_custom_command_descriptions(&current_dir_owned, &plugins)
        })
        .await
        .map_err(|e| ExecutorError::Io(std::io::Error::other(e)))?;

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

        SlashCommandCache::instance().put(key, commands.clone());

        Ok(commands)
    }
}
