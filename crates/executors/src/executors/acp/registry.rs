//! Agents published in the ACP registry (https://agentclientprotocol.com/registry).
//!
//! The registry is fetched over HTTP, kept in memory and mirrored to the cache
//! dir so the last good copy survives restarts and offline launches.

use std::{collections::HashMap, path::PathBuf, sync::LazyLock, time::Duration};

use serde::Deserialize;
use thiserror::Error;
use tokio::sync::RwLock;

use crate::{
    command::CommandBuilder,
    executors::{BaseCodingAgent, ExecutorError},
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
} // binary/uvx are ignored for now

#[derive(Debug, Clone, Deserialize)]
pub struct NpxDistribution {
    pub package: String,
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

/// Agents users can install: npx-distributed and without a built-in executor.
pub fn visible_agents(agents: &[RegistryAgent]) -> Vec<RegistryAgent> {
    agents
        .iter()
        .filter(|agent| agent.distribution.npx.is_some())
        .filter(|agent| !HIDDEN_IDS.contains(&agent.id.as_str()))
        .cloned()
        .collect()
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
    fn parse_registry_rejects_malformed_document() {
        assert!(parse_registry("not json").is_err());
        assert!(parse_registry(r#"{"agents": {}}"#).is_err());
    }

    #[test]
    fn visible_agents_keeps_npx_and_drops_hidden() {
        let agents = parse_registry(FIXTURE).unwrap();
        assert_eq!(
            ids(&visible_agents(&agents)),
            ["auggie", "cline", "kilo", "qoder"]
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
