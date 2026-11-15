//! Agents published in the ACP registry (https://agentclientprotocol.com/registry).
//!
//! The registry is fetched over HTTP, kept in memory and mirrored to the cache
//! dir so the last good copy survives restarts and offline launches.

use std::{collections::HashMap, path::PathBuf, sync::LazyLock, time::Duration};

use serde::Deserialize;
use thiserror::Error;
use tokio::sync::RwLock;

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{BaseCodingAgent, ExecutorError, acp::install},
};

const REGISTRY_URL: &str = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const CACHE_FILE_NAME: &str = "acp_registry.json";

/// Registry ids of agents that already have a built-in executor
const HIDDEN_IDS: &[&str] = &[
    "github-copilot-cli",
    "gemini",
    "qwen-code",
    "factory-droid",
    "claude-acp",
    "codex-acp",
];

static REGISTRY_CACHE: LazyLock<RwLock<Option<Vec<RegistryAgent>>>> =
    LazyLock::new(|| RwLock::new(None));

static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .build()
        .expect("failed to build ACP registry HTTP client")
});

#[derive(Debug, Clone, Deserialize)]
pub struct RegistryAgent {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    pub icon: Option<String>,
    #[serde(default)]
    pub distribution: Distribution,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Distribution {
    pub npx: Option<NpxDistribution>,
    /// Platform key (`windows-x86_64`, `darwin-aarch64`, ...) to archive.
    #[serde(default)]
    pub binary: HashMap<String, BinaryTarget>,
} // uvx is ignored for now

#[derive(Debug, Clone, Deserialize)]
pub struct NpxDistribution {
    pub package: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

/// A platform archive from the registry: download `archive`, verify `sha256`,
/// unpack it and run `cmd` (relative to the archive root) with `args`.
#[derive(Debug, Clone, Deserialize)]
pub struct BinaryTarget {
    pub archive: String,
    #[serde(default)]
    pub sha256: Option<String>,
    pub cmd: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Error)]
pub enum RegistryError {
    #[error("failed to fetch ACP registry: {0}")]
    Fetch(#[from] reqwest::Error),
    #[error("failed to parse ACP registry: {0}")]
    Parse(#[from] serde_json::Error),
}

/// Agents are converted one by one so a single malformed entry is skipped
/// instead of failing the whole registry.
#[derive(Deserialize)]
struct RawRegistry {
    agents: Vec<serde_json::Value>,
}

/// Parses registry JSON, skipping (and logging) entries that don't match
/// [`RegistryAgent`]. Fails only if the document itself is malformed.
pub fn parse_registry(json: &str) -> Result<Vec<RegistryAgent>, serde_json::Error> {
    let raw: RawRegistry = serde_json::from_str(json)?;
    Ok(raw
        .agents
        .into_iter()
        .filter_map(|value| {
            let id = value
                .get("id")
                .and_then(|id| id.as_str())
                .unwrap_or("<unknown>")
                .to_string();
            serde_json::from_value(value)
                .inspect_err(|e| tracing::warn!("Skipping ACP registry agent '{id}': {e}"))
                .ok()
        })
        .collect())
}

/// Agents users can install: distributed as an npx package or as an archive for
/// this platform, and without a built-in executor.
pub fn visible_agents(agents: &[RegistryAgent]) -> Vec<RegistryAgent> {
    let platform = install::platform_key();
    agents
        .iter()
        .filter(|agent| available_on(agent, platform))
        .filter(|agent| !HIDDEN_IDS.contains(&agent.id.as_str()))
        .cloned()
        .collect()
}

/// npx works everywhere; an archive only where the registry ships one for the
/// host platform, so agents that only ship e.g. `darwin-aarch64` are not offered
/// on Windows or Linux.
fn available_on(agent: &RegistryAgent, platform: Option<&str>) -> bool {
    agent.distribution.npx.is_some()
        || platform
            .and_then(|platform| agent.distribution.binary.get(platform))
            .is_some()
}

/// The npx distribution of agent `id`, hidden ones included.
pub fn npx_of(agents: &[RegistryAgent], id: &str) -> Option<NpxDistribution> {
    agents
        .iter()
        .find(|agent| agent.id == id)
        .and_then(|agent| agent.distribution.npx.clone())
}

/// The npx distribution of agent `id` (hidden ones included) from the memory or
/// disk copy only. Never fetches: callers on the spawn path have a fallback, and
/// startup refreshes the registry.
pub async fn find_npx(id: &str) -> Option<NpxDistribution> {
    npx_of(&load_cached().await?, id)
}

/// Puts the package in the base, like the built-in npx agents, so that a
/// `base_command_override` (which replaces only the base) swaps out the whole
/// `npx -y <package>` and keeps only the registry args.
pub(crate) fn npx_command(
    registry_id: &str,
    npx: &NpxDistribution,
) -> Result<CommandBuilder, ExecutorError> {
    // npm names can't contain whitespace; a broken registry entry must not
    // split into extra arguments when the base is parsed
    if npx.package.is_empty() || npx.package.chars().any(char::is_whitespace) {
        return Err(ExecutorError::InvalidAcpRegistryPackage {
            id: registry_id.to_string(),
            package: npx.package.clone(),
        });
    }
    Ok(CommandBuilder::new(format!("npx -y {}", npx.package)).extend_params(npx.args.clone()))
}

impl RegistryAgent {
    /// Archive for the machine this build runs on, if the registry ships one.
    pub fn binary_target(&self) -> Option<&BinaryTarget> {
        self.distribution.binary.get(install::platform_key()?)
    }
}

/// The command for a registry agent and the env its distribution sets.
///
/// Prefers the npx package, then the platform archive (downloaded into the cache
/// dir on first use). A `base_command_override` replaces the base of either and
/// skips the download, which lets users point an agent at a binary they installed
/// themselves.
pub async fn command_for(
    agent: &RegistryAgent,
    overrides: &CmdOverrides,
) -> Result<(CommandBuilder, HashMap<String, String>), ExecutorError> {
    let has_override = overrides.base_command_override.is_some();

    if let Some(npx) = &agent.distribution.npx {
        let command = if has_override {
            CommandBuilder::new(agent.id.clone())
        } else {
            npx_command(&agent.id, npx)?
        };
        return Ok((apply_overrides(command, overrides)?, npx.env.clone()));
    }

    if has_override {
        let env = agent
            .binary_target()
            .map(|target| target.env.clone())
            .unwrap_or_default();
        return Ok((
            apply_overrides(CommandBuilder::new(agent.id.clone()), overrides)?,
            env,
        ));
    }

    let host = install::platform_key().ok_or_else(|| ExecutorError::AcpRegistryNoPlatform {
        id: agent.id.clone(),
        platform: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
    })?;
    let target = agent.distribution.binary.get(host).ok_or_else(|| {
        ExecutorError::AcpRegistryNoPlatform {
            id: agent.id.clone(),
            platform: host.to_string(),
        }
    })?;

    let installed = install::ensure_installed(&agent.id, &agent.version, host, target).await?;
    let command = CommandBuilder::new(install::command_line(&installed.command))
        .extend_params(installed.args.clone());

    Ok((apply_overrides(command, overrides)?, installed.env))
}

/// Executor key for a registry agent, in the same SCREAMING_SNAKE form as the
/// built-in ones (`glm-acp-agent` -> `GLM_ACP_AGENT`).
///
/// WARNING: the output is persisted (profiles.json keys, stored executor names).
/// Changing this mapping orphans installed agents — never change it.
pub fn registry_key(id: &str) -> BaseCodingAgent {
    let key: String = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect();
    BaseCodingAgent::from(key)
}

/// Fetches the registry and returns the visible agents. If the fetch fails,
/// falls back to the memory or disk copy; errors only if neither exists.
pub async fn refresh() -> Result<Vec<RegistryAgent>, RegistryError> {
    match refresh_from_network().await {
        Ok(agents) => Ok(visible_agents(&agents)),
        Err(e) => {
            tracing::warn!("{e}");
            match load_cached().await {
                Some(agents) => Ok(visible_agents(&agents)),
                None => Err(e),
            }
        }
    }
}

/// Visible agents from the memory or disk copy, fetching only if neither
/// exists yet.
pub async fn cached() -> Result<Vec<RegistryAgent>, RegistryError> {
    if let Some(agents) = load_cached().await {
        return Ok(visible_agents(&agents));
    }

    refresh_from_network()
        .await
        .map(|agents| visible_agents(&agents))
        .inspect_err(|e| tracing::warn!("{e}"))
}

/// The memory copy, else the disk copy (which then populates memory).
async fn load_cached() -> Option<Vec<RegistryAgent>> {
    if let Some(agents) = REGISTRY_CACHE.read().await.as_ref() {
        return Some(agents.clone());
    }

    let agents = load_from_disk().await?;
    *REGISTRY_CACHE.write().await = Some(agents.clone());
    Some(agents)
}

async fn refresh_from_network() -> Result<Vec<RegistryAgent>, RegistryError> {
    let body = HTTP_CLIENT
        .get(REGISTRY_URL)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    let agents = parse_registry(&body)?;

    if let Err(e) = save_to_disk(&body).await {
        tracing::warn!("Failed to write ACP registry cache: {e}");
    }
    *REGISTRY_CACHE.write().await = Some(agents.clone());

    Ok(agents)
}

fn cache_path() -> PathBuf {
    workspace_utils::cache_dir().join(CACHE_FILE_NAME)
}

async fn load_from_disk() -> Option<Vec<RegistryAgent>> {
    let path = cache_path();
    let json = match tokio::fs::read_to_string(&path).await {
        Ok(json) => json,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return None,
        Err(e) => {
            tracing::warn!("Failed to read ACP registry cache {}: {e}", path.display());
            return None;
        }
    };

    parse_registry(&json)
        .inspect_err(|e| tracing::warn!("Ignoring corrupt ACP registry cache: {e}"))
        .ok()
}

/// Writes via a temp file + rename so a crash never leaves a partial cache.
async fn save_to_disk(json: &str) -> std::io::Result<()> {
    let path = cache_path();
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }
    let tmp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    tokio::fs::write(&tmp, json).await?;
    tokio::fs::rename(&tmp, &path).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("registry_fixture.json");

    fn ids(agents: &[RegistryAgent]) -> Vec<&str> {
        agents.iter().map(|a| a.id.as_str()).collect()
    }

    #[test]
    fn parse_registry_skips_malformed_entries() {
        let agents = parse_registry(FIXTURE).unwrap();
        assert_eq!(
            ids(&agents),
            ["auggie", "claude-acp", "cline", "goose", "kilo", "qoder"]
        );
    }

    #[test]
    fn parse_registry_reads_npx_distribution() {
        let agents = parse_registry(FIXTURE).unwrap();
        let auggie = agents.iter().find(|a| a.id == "auggie").unwrap();
        let npx = auggie.distribution.npx.as_ref().unwrap();
        assert_eq!(npx.args, ["--acp"]);
        assert!(npx.env.contains_key("AUGMENT_DISABLE_AUTO_UPDATE"));

        let goose = agents.iter().find(|a| a.id == "goose").unwrap();
        assert!(goose.distribution.npx.is_none());
    }

    #[test]
    fn parse_registry_reads_binary_distribution() {
        let agents = parse_registry(FIXTURE).unwrap();
        let goose = agents.iter().find(|a| a.id == "goose").unwrap();
        let target = goose.distribution.binary.get("darwin-aarch64").unwrap();
        assert_eq!(target.cmd, "./goose");
        assert_eq!(target.args, ["acp"]);
        assert!(target.sha256.is_some());
    }

    #[test]
    fn parse_registry_rejects_malformed_document() {
        assert!(parse_registry("not json").is_err());
        assert!(parse_registry(r#"{"agents": {}}"#).is_err());
    }

    #[test]
    fn visible_agents_keeps_npx_and_supported_binary_and_drops_hidden() {
        let agents = parse_registry(FIXTURE).unwrap();
        let mut expected = vec!["auggie", "cline", "kilo", "qoder"];
        // goose only ships a darwin-aarch64 archive in the fixture
        if install::platform_key() == Some("darwin-aarch64") {
            expected.insert(2, "goose");
        }
        assert_eq!(ids(&visible_agents(&agents)), expected);
    }

    #[test]
    fn binary_agents_are_only_offered_on_shipped_platforms() {
        let agents = parse_registry(FIXTURE).unwrap();
        let goose = agents.iter().find(|a| a.id == "goose").unwrap();
        let auggie = agents.iter().find(|a| a.id == "auggie").unwrap();

        assert!(available_on(goose, Some("darwin-aarch64")));
        assert!(!available_on(goose, Some("windows-x86_64")));
        assert!(!available_on(goose, None));
        // npx agents need no archive, so they show on every platform
        assert!(available_on(auggie, None));
    }

    #[tokio::test]
    async fn base_command_override_skips_the_binary_download() {
        let agents = parse_registry(FIXTURE).unwrap();
        let goose = agents.iter().find(|a| a.id == "goose").unwrap();
        let overrides = CmdOverrides {
            base_command_override: Some("/opt/goose".to_string()),
            ..Default::default()
        };

        let (command, env) = command_for(goose, &overrides).await.unwrap();
        assert_eq!(command.base, "/opt/goose");
        assert_eq!(command.params, None);
        assert!(env.is_empty());
    }

    #[tokio::test]
    async fn npx_preferred_over_binary_and_keeps_its_env() {
        let agents = parse_registry(FIXTURE).unwrap();
        let kilo = agents.iter().find(|a| a.id == "kilo").unwrap();

        let (command, env) = command_for(kilo, &CmdOverrides::default()).await.unwrap();
        assert_eq!(command.base, "npx -y @kilocode/cli@7.8.18");
        assert!(env.is_empty());
    }

    /// Downloads and runs a real release archive from the registry. Run with
    /// `cargo test -p executors --lib installs_a_binary_agent -- --ignored`.
    #[tokio::test]
    #[ignore = "downloads a release archive over the network"]
    async fn installs_a_binary_agent() {
        // `cached` reads the disk copy first, so this also works offline after
        // one successful registry fetch.
        let agents = cached().await.unwrap();
        let mut agent = agents
            .iter()
            .find(|agent| agent.id == "opencode-v2")
            .expect("opencode-v2 is in the registry")
            .clone();
        // Exercise the archive path even if the entry also gains an npx package.
        agent.distribution.npx = None;
        let platform = install::platform_key().expect("a supported platform");
        let target = agent
            .binary_target()
            .expect("a binary archive for this platform");
        assert!(
            install::ensure_installed(&agent.id, &agent.version, platform, target)
                .await
                .unwrap()
                .command
                .is_file()
        );

        // The whole spawn path, not just the installer.
        let (command, _) = command_for(&agent, &CmdOverrides::default()).await.unwrap();
        assert_eq!(command.params, Some(vec!["acp".to_string()]));

        let binary = std::path::PathBuf::from(command.base.trim_matches('"'));
        assert!(binary.is_file(), "{} is not a file", binary.display());

        let output = std::process::Command::new(&binary)
            .arg("--version")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{} --version failed: {}",
            binary.display(),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn npx_of_includes_hidden_agents() {
        let agents = parse_registry(FIXTURE).unwrap();
        assert!(HIDDEN_IDS.contains(&"claude-acp"));
        assert!(npx_of(&agents, "claude-acp").is_some());
        assert!(npx_of(&agents, "goose").is_none()); // no npx distribution
        assert!(npx_of(&agents, "unknown").is_none());
    }

    fn kilo() -> NpxDistribution {
        NpxDistribution {
            package: "@kilocode/cli@7.8.18".to_string(),
            args: vec!["acp".to_string()],
            env: Default::default(),
        }
    }

    #[test]
    fn package_is_part_of_the_base() {
        let command = npx_command("kilo", &kilo()).unwrap();
        assert_eq!(command.base, "npx -y @kilocode/cli@7.8.18");
        assert_eq!(command.params, Some(vec!["acp".to_string()]));
    }

    #[test]
    fn rejects_package_with_whitespace() {
        for package in ["@kilocode/cli acp", "", "pkg\t--evil"] {
            let npx = NpxDistribution {
                package: package.to_string(),
                ..kilo()
            };
            assert!(matches!(
                npx_command("kilo", &npx),
                Err(ExecutorError::InvalidAcpRegistryPackage { .. })
            ));
        }
    }

    #[test]
    fn registry_key_is_screaming_snake() {
        assert_eq!(registry_key("kilo").as_str(), "KILO");
        assert_eq!(registry_key("glm-acp-agent").as_str(), "GLM_ACP_AGENT");
        assert_eq!(registry_key("some.agent_v2").as_str(), "SOME_AGENT_V2");

        // Stored keys pass through de_base_coding_agent_kebab (profile.rs),
        // which must leave them unchanged
        let key = registry_key("glm-acp-agent").to_string();
        assert_eq!(key.replace('-', "_").to_ascii_uppercase(), key);
    }

    #[test]
    fn parse_registry_defaults_missing_description() {
        let json = r#"{"agents": [
            {"id": "no-desc", "name": "No Desc", "version": "1.0.0"},
            {"id": "no-name", "version": "1.0.0", "description": "Missing a name"}
        ]}"#;
        let agents = parse_registry(json).unwrap();
        assert_eq!(ids(&agents), ["no-desc"]);
        assert_eq!(agents[0].description, "");
    }
}
