//! Live model discovery for ACP agents (Copilot and agents from the ACP registry).
//!
//! The agent is started in a temporary directory, sent `initialize` + `session/new`, and the
//! models, reasoning options and modes it advertises are read from the response. Nothing here is
//! specific to one agent; executors only supply the command (and optionally a prepare step).
//!
//! Caching:
//! - fresh: the shared [`executor_options_cache`] TtlCache (5 minutes), holding only live results.
//!   A hit is served as is and starts nothing.
//! - older: an in-memory map backed by a file per agent under `cache_dir()/acp-options`. Served
//!   while a live refresh runs, and the only thing read at startup. Never put in the TtlCache, so
//!   an old list is never mistaken for a fresh one.

use std::{
    collections::{BTreeMap, HashMap},
    path::PathBuf,
    sync::{Arc, LazyLock, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use acp::{
    Agent, ConnectionTo,
    schema::v1::{RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse},
};
use futures::{StreamExt, future::BoxFuture, stream::BoxStream};
use json_patch::Patch;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::{io::AsyncReadExt, sync::mpsc};

use crate::{
    command::CommandBuilder,
    executor_discovery::{ExecutorConfigCacheKey, ExecutorDiscoveredOptions},
    executors::{
        BaseCodingAgent,
        acp::{
            harness_v2::{
                ConnectionSink, SETUP_TIMEOUT, initialize, open_session, spawn_acp_process,
                take_transport,
            },
            session_config::{Setter, set_value},
        },
        utils::executor_options_cache,
    },
    logs::utils::patch,
    model_selector::{ModelInfo, ModelSelectorConfig, PermissionPolicy},
};

/// Don't start a live discovery again within this long after a success
/// (the same as the fresh cache's TTL) or after a failure.
const MIN_REFRESH_AFTER_SUCCESS: Duration = Duration::from_secs(5 * 60);
const MIN_REFRESH_AFTER_FAILURE: Duration = Duration::from_secs(30);

const DISK_CACHE_DIR: &str = "acp-options";
const DISK_CACHE_VERSION: u32 = 1;

/// Adds flags to the discovery command right before a live discovery starts (Copilot uses it
/// to stop MCP servers from starting). Gets the command and its env.
pub type PrepareFn =
    fn(CommandBuilder, HashMap<String, String>) -> BoxFuture<'static, CommandBuilder>;

/// What an executor supplies for discovery. Building it must have no side effects: it's also
/// used to compute the cache key on every selector open and at startup.
#[derive(Clone)]
pub struct DiscoverySpec {
    pub base_executor: BaseCodingAgent,
    /// Base command + user overrides, without run-only flags such as `--model`.
    pub command: CommandBuilder,
    /// Env from the profile and the agent's distribution.
    pub env: HashMap<String, String>,
    pub prepare: Option<PrepareFn>,
    /// Shown when discovery fails and nothing is cached.
    pub fallback: Option<ExecutorDiscoveredOptions>,
    /// What identifies the agent's list, hashed into the cache key. Leave out anything that
    /// changes on every agent release (a versioned package), so an update still shows the
    /// older list while the new one loads.
    pub key_input: serde_json::Value,
}

impl DiscoverySpec {
    pub fn cache_key(&self) -> ExecutorConfigCacheKey {
        cache_key(&self.base_executor, &self.key_input)
    }
}

/// sha256 over the executor and `key_input`. Only the hash is stored or logged, never the
/// input itself (its env may hold tokens).
pub fn cache_key(
    base_executor: &BaseCodingAgent,
    key_input: &serde_json::Value,
) -> ExecutorConfigCacheKey {
    let input = serde_json::json!({
        "executor": base_executor.to_string(),
        "input": key_input,
    });
    let digest = Sha256::digest(input.to_string().as_bytes());
    let hash = digest
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    ExecutorConfigCacheKey::new(None, hash, base_executor.clone())
}

/// A key input from a command and its env, with the env sorted so its order doesn't matter.
pub fn command_key_input(
    command: &CommandBuilder,
    env: &HashMap<String, String>,
) -> serde_json::Value {
    let env: BTreeMap<&String, &String> = env.iter().collect();
    serde_json::json!({
        "base": command.base,
        "params": command.params,
        "env": env,
    })
}

#[derive(Debug, Clone)]
struct Attempt {
    at: Instant,
    error: Option<String>,
}

/// Lists served while a live refresh runs, keyed like the fresh cache.
static OLDER: LazyLock<Mutex<HashMap<ExecutorConfigCacheKey, ExecutorDiscoveredOptions>>> =
    LazyLock::new(Default::default);
static ATTEMPTS: LazyLock<Mutex<HashMap<ExecutorConfigCacheKey, Attempt>>> =
    LazyLock::new(Default::default);
/// One live discovery per key at a time.
static IN_FLIGHT: LazyLock<Mutex<HashMap<ExecutorConfigCacheKey, Arc<tokio::sync::Mutex<()>>>>> =
    LazyLock::new(Default::default);

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Default permissions while nothing better is known, so the control never disappears.
pub fn base_permissions() -> Vec<PermissionPolicy> {
    vec![PermissionPolicy::Auto, PermissionPolicy::Supervised]
}

/// Loads the disk cache into memory. Called at startup; starts no process.
pub async fn warm(key: ExecutorConfigCacheKey) {
    if lock(&OLDER).contains_key(&key) {
        return;
    }
    if let Some(options) = read_disk(&key).await {
        lock(&OLDER).insert(key, options);
    }
}

/// Streams the options for the agent: the fresh cache if any, otherwise the older list (or
/// just "Default") right away, then the live result.
pub fn discover(spec: DiscoverySpec) -> BoxStream<'static, Patch> {
    let key = spec.cache_key();
    if let Some(fresh) = executor_options_cache().get(&key) {
        return Box::pin(futures::stream::once(async move {
            patch::executor_discovered_options(fresh.as_ref().clone())
        }));
    }

    async_stream::stream! {
        let in_memory = lock(&OLDER).get(&key).cloned();
        let older = match in_memory {
            Some(o) => Some(o),
            None => read_disk(&key).await,
        };
        let shown_older = older.is_some();
        let initial = older.unwrap_or_else(|| ExecutorDiscoveredOptions {
            model_selector: ModelSelectorConfig {
                permissions: base_permissions(),
                ..Default::default()
            },
            ..Default::default()
        });
        yield patch::executor_discovered_options(ExecutorDiscoveredOptions {
            models_complete: false,
            error: None,
            ..initial
        }.with_loading(true));

        // One live discovery per key; whoever waited reuses its result. The guard moves into the
        // discovery task, so it's held until discovery ends even if this stream is dropped.
        let flight = lock(&IN_FLIGHT).entry(key.clone()).or_default().clone();
        let guard = flight.lock_owned().await;

        if let Some(fresh) = executor_options_cache().get(&key) {
            yield patch::executor_discovered_options(fresh.as_ref().clone());
            return;
        }
        match recent_attempt(&key) {
            Some(RecentAttempt::Failure(error)) => {
                if !shown_older && let Some(fallback) = spec.fallback.clone() {
                    yield patch::executor_discovered_options(fallback);
                }
                yield patch::discovery_error(error);
                return;
            }
            // Succeeded recently but the fresh entry was evicted: the older list is current.
            Some(RecentAttempt::Success) if shown_older => {
                yield patch::models_loaded();
                yield patch::agents_loaded();
                yield patch::slash_commands_loaded();
                return;
            }
            _ => {}
        }

        let (tx, mut rx) = mpsc::unbounded_channel::<Progress>();
        let task = tokio::spawn(discover_and_store(spec.clone(), key.clone(), tx, guard));
        while let Some(progress) = rx.recv().await {
            match progress {
                Progress::Models { models, permissions } => {
                    yield patch::update_models(models);
                    yield patch::update_permissions(permissions);
                    yield patch::update_models_complete(true);
                    yield patch::models_loaded();
                }
                Progress::Reasoning(models) => yield patch::update_models(models),
            }
        }

        match task.await.unwrap_or_else(|e| Err(format!("discovery task failed: {e}"))) {
            Ok(()) => {
                yield patch::agents_loaded();
                yield patch::slash_commands_loaded();
            }
            Err(error) => {
                if !shown_older && let Some(fallback) = spec.fallback.clone() {
                    yield patch::executor_discovered_options(fallback);
                }
                yield patch::discovery_error(error);
            }
        }
    }
    .boxed()
}

/// Runs a live discovery and stores the result, even if nobody is listening anymore.
async fn discover_and_store(
    spec: DiscoverySpec,
    key: ExecutorConfigCacheKey,
    tx: mpsc::UnboundedSender<Progress>,
    _in_flight: tokio::sync::OwnedMutexGuard<()>,
) -> Result<(), String> {
    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel::<Progress>();
    let live = tokio::spawn(run_live(spec.clone(), progress_tx));

    let mut models = None;
    let mut permissions = base_permissions();
    while let Some(progress) = progress_rx.recv().await {
        match &progress {
            Progress::Models {
                models: m,
                permissions: p,
            } => {
                models = Some(m.clone());
                permissions = p.clone();
            }
            Progress::Reasoning(m) => models = Some(m.clone()),
        }
        let _ = tx.send(progress);
    }

    let result = live
        .await
        .unwrap_or_else(|e| Err(format!("discovery task failed: {e}")))
        .and_then(|()| models.ok_or_else(|| "the agent reported no models".to_string()));
    match result {
        Ok(models) => {
            record_attempt(&key, None);
            let options = ExecutorDiscoveredOptions {
                model_selector: ModelSelectorConfig {
                    models,
                    permissions,
                    ..Default::default()
                },
                models_complete: true,
                ..Default::default()
            };
            store(&key, options).await;
            Ok(())
        }
        Err(error) => {
            tracing::warn!(executor = %spec.base_executor, "ACP option discovery failed: {error}");
            record_attempt(&key, Some(error.clone()));
            Err(error)
        }
    }
}

enum RecentAttempt {
    Success,
    Failure(String),
}

/// The last live discovery for this key, if it's too recent to start another one.
fn recent_attempt(key: &ExecutorConfigCacheKey) -> Option<RecentAttempt> {
    let attempts = lock(&ATTEMPTS);
    let attempt = attempts.get(key)?;
    let elapsed = attempt.at.elapsed();
    match &attempt.error {
        Some(error) if elapsed < MIN_REFRESH_AFTER_FAILURE => {
            Some(RecentAttempt::Failure(error.clone()))
        }
        None if elapsed < MIN_REFRESH_AFTER_SUCCESS => Some(RecentAttempt::Success),
        _ => None,
    }
}

/// Drops a failed attempt, so the next selector open tries again right away. Called when a run
/// opens a session: the agent now works (the user just signed in), whatever discovery last saw.
pub fn forget_failure(key: &ExecutorConfigCacheKey) {
    let mut attempts = lock(&ATTEMPTS);
    if attempts.get(key).is_some_and(|a| a.error.is_some()) {
        attempts.remove(key);
    }
}

fn record_attempt(key: &ExecutorConfigCacheKey, error: Option<String>) {
    lock(&ATTEMPTS).insert(
        key.clone(),
        Attempt {
            at: Instant::now(),
            error,
        },
    );
}

async fn store(key: &ExecutorConfigCacheKey, options: ExecutorDiscoveredOptions) {
    executor_options_cache().put(key.clone(), options.clone());
    let older = ExecutorDiscoveredOptions {
        models_complete: false,
        ..options
    };
    lock(&OLDER).insert(key.clone(), older.clone());
    if let Err(e) = write_disk(key, &older).await {
        tracing::warn!("Failed to write ACP options cache: {e}");
    }
}

#[derive(Serialize, Deserialize)]
struct DiskEntry {
    version: u32,
    saved_at: u64,
    options: ExecutorDiscoveredOptions,
}

fn disk_path(key: &ExecutorConfigCacheKey) -> PathBuf {
    workspace_utils::cache_dir()
        .join(DISK_CACHE_DIR)
        .join(format!("{}.json", key.cmd_key))
}

async fn read_disk(key: &ExecutorConfigCacheKey) -> Option<ExecutorDiscoveredOptions> {
    let json = tokio::fs::read_to_string(disk_path(key)).await.ok()?;
    parse_disk(&json)
}

/// Lists from disk are older lists: never complete, never loading, no stale error.
fn parse_disk(json: &str) -> Option<ExecutorDiscoveredOptions> {
    let entry: DiskEntry = serde_json::from_str(json)
        .inspect_err(|e| tracing::debug!("Ignoring unreadable ACP options cache: {e}"))
        .ok()?;
    if entry.version != DISK_CACHE_VERSION {
        return None;
    }
    let mut options = entry.options;
    // Lists saved before choices were de-duplicated can hold a model twice (Copilot's `auto`)
    let mut seen = std::collections::HashSet::new();
    options
        .model_selector
        .models
        .retain(|m| seen.insert((m.provider_id.clone(), m.id.clone())));
    Some(ExecutorDiscoveredOptions {
        models_complete: false,
        loading_models: false,
        loading_agents: false,
        loading_slash_commands: false,
        error: None,
        ..options
    })
}

/// Written to a temp file first and renamed, so a crash or a second app instance never leaves
/// a half-written file.
async fn write_disk(
    key: &ExecutorConfigCacheKey,
    options: &ExecutorDiscoveredOptions,
) -> std::io::Result<()> {
    let path = disk_path(key);
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }
    let entry = DiskEntry {
        version: DISK_CACHE_VERSION,
        saved_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or_default(),
        options: options.clone(),
    };
    let json = serde_json::to_string(&entry).map_err(std::io::Error::other)?;
    let tmp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    tokio::fs::write(&tmp, json).await?;
    if let Err(e) = tokio::fs::rename(&tmp, &path).await {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(e);
    }
    Ok(())
}

enum Progress {
    /// The model list, before reasoning options are known.
    Models {
        models: Vec<ModelInfo>,
        permissions: Vec<PermissionPolicy>,
    },
    /// The same list with each model's reasoning options.
    Reasoning(Vec<ModelInfo>),
}

/// Shown in the model selector when the agent rejects `session/new` with -32000. Says nothing
/// about a Sign in button: registry agents share this code and don't get one.
const NOT_SIGNED_IN: &str = "Not signed in to this agent.";

/// Starts the agent in a temp dir, reads what it advertises, then kills it. The whole run is
/// limited to [`SETUP_TIMEOUT`] (long enough for a first npx download).
async fn run_live(spec: DiscoverySpec, tx: mpsc::UnboundedSender<Progress>) -> Result<(), String> {
    let temp_dir = tempfile::TempDir::new().map_err(|e| format!("temp dir: {e}"))?;
    let mut command = spec.command.clone();
    if let Some(prepare) = spec.prepare {
        command = prepare(command, spec.env.clone()).await;
    }
    let parts = command.build_initial().map_err(|e| e.to_string())?;
    let mut child = spawn_acp_process(temp_dir.path(), parts, &spec.env)
        .await
        .map_err(|e| e.to_string())?;
    let transport = take_transport(&mut child).map_err(|e| e.to_string())?;

    // Keep the tail of stderr for the error message; also stops a chatty agent from blocking.
    let stderr_tail = Arc::new(Mutex::new(String::new()));
    if let Some(mut stderr) = child.inner().stderr.take() {
        let tail = stderr_tail.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            while let Ok(n) = stderr.read(&mut buf).await {
                if n == 0 {
                    break;
                }
                let mut tail = lock(&tail);
                tail.push_str(&String::from_utf8_lossy(&buf[..n]));
                if tail.len() > 2000 {
                    let cut = tail.len() - 2000;
                    let cut = (cut..tail.len())
                        .find(|i| tail.is_char_boundary(*i))
                        .unwrap_or(0);
                    tail.drain(..cut);
                }
            }
        });
    }

    let cwd = temp_dir.path().to_path_buf();
    let connection = acp::Client
        .builder()
        .on_receive_request(
            async move |_request: RequestPermissionRequest, responder, _cx| {
                let _ = responder.respond(RequestPermissionResponse::new(
                    RequestPermissionOutcome::Cancelled,
                ));
                Ok(())
            },
            acp::on_receive_request!(),
        )
        .connect_with(transport, async move |connection: ConnectionTo<Agent>| {
            probe(&connection, cwd, &tx).await
        });

    let mut signed_out = false;
    let result = match tokio::time::timeout(SETUP_TIMEOUT, connection).await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => {
            signed_out = e.code == acp::ErrorCode::AuthRequired;
            Err(e.message)
        }
        Err(_) => Err("timed out waiting for the agent".to_string()),
    };
    let _ = child.kill().await;
    drop(temp_dir);

    if signed_out {
        // Shown as is: the agent's stderr tail would only bury it
        return Err(NOT_SIGNED_IN.to_string());
    }
    result.map_err(|error| {
        let tail = lock(&stderr_tail).trim().to_string();
        let last_line = tail.lines().rev().find(|l| !l.trim().is_empty());
        match last_line {
            Some(line) => format!("{error} ({line})"),
            None => error,
        }
    })
}

/// Reads models, then each model's reasoning options by switching to it in the throwaway
/// session (about 10ms each for Copilot), then switches back to the original model.
async fn probe(
    connection: &ConnectionTo<Agent>,
    cwd: PathBuf,
    tx: &mpsc::UnboundedSender<Progress>,
) -> Result<(), acp::Error> {
    initialize(connection).await?;
    let (session_id, mut options) = open_session(connection, None, cwd).await?;

    let mut permissions = base_permissions();
    if options.has_plan_mode() {
        permissions.push(PermissionPolicy::Plan);
    }

    let Some(slot) = options.model_slot() else {
        let _ = tx.send(Progress::Models {
            models: vec![],
            permissions,
        });
        return Ok(());
    };
    let mut models: Vec<ModelInfo> = slot
        .choices
        .iter()
        .map(|c| ModelInfo {
            id: c.value.clone(),
            name: c.name.clone(),
            provider_id: None,
            reasoning_options: vec![],
        })
        .collect();
    let _ = tx.send(Progress::Models {
        models: models.clone(),
        permissions,
    });

    // Only config options carry reasoning; the older `models` object has none.
    if !matches!(slot.setter, Setter::ConfigOption(_)) {
        return Ok(());
    }
    let original = slot.current.clone();
    let mut sink = ConnectionSink {
        connection,
        session_id,
    };
    for model in &mut models {
        let current = options.model_slot().and_then(|s| s.current);
        if current.as_deref() != Some(model.id.as_str())
            && let Err(e) = set_value(&mut options, &slot.setter, &model.id, &mut sink).await
        {
            tracing::debug!("Couldn't read reasoning options for {}: {e}", model.id);
            continue;
        }
        model.reasoning_options = options.reasoning_options();
    }
    if let Some(original) = original
        && options.model_slot().and_then(|s| s.current) != Some(original.clone())
    {
        let _ = set_value(&mut options, &slot.setter, &original, &mut sink).await;
    }
    let _ = tx.send(Progress::Reasoning(models));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(env: &[(&str, &str)]) -> DiscoverySpec {
        let command = CommandBuilder::new("npx -y @github/copilot").extend_params(["--acp"]);
        let env: HashMap<String, String> = env
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        DiscoverySpec {
            base_executor: BaseCodingAgent::copilot(),
            key_input: command_key_input(&command, &env),
            command,
            env,
            prepare: None,
            fallback: None,
        }
    }

    #[test]
    fn cache_key_is_a_stable_hash_without_secrets() {
        let a = spec(&[("A", "1"), ("GH_TOKEN", "secret-token")]);
        let b = spec(&[("GH_TOKEN", "secret-token"), ("A", "1")]);
        let key = a.cache_key();
        assert_eq!(key, b.cache_key(), "env order must not matter");
        assert_eq!(key.cmd_key.len(), 64);
        assert!(!key.cmd_key.contains("secret"));
        assert_eq!(key.path, None);
        assert_ne!(key, spec(&[("A", "2")]).cache_key());
    }

    #[test]
    fn disk_entry_round_trips_and_is_never_complete() {
        let options = ExecutorDiscoveredOptions {
            model_selector: ModelSelectorConfig {
                models: vec![ModelInfo {
                    id: "m".into(),
                    name: "M".into(),
                    provider_id: None,
                    reasoning_options: vec![],
                }],
                permissions: base_permissions(),
                ..Default::default()
            },
            models_complete: true,
            ..Default::default()
        };
        let entry = DiskEntry {
            version: DISK_CACHE_VERSION,
            saved_at: 1,
            options: options.with_loading(true),
        };
        let json = serde_json::to_string(&entry).unwrap();
        let parsed = parse_disk(&json).unwrap();
        assert_eq!(parsed.model_selector.models[0].id, "m");
        assert!(!parsed.models_complete);
        assert!(!parsed.loading_models && !parsed.loading_agents);
        assert_eq!(parsed.model_selector.permissions, base_permissions());
    }

    #[test]
    fn unknown_version_or_broken_file_is_ignored() {
        let entry = DiskEntry {
            version: DISK_CACHE_VERSION + 1,
            saved_at: 1,
            options: Default::default(),
        };
        assert!(parse_disk(&serde_json::to_string(&entry).unwrap()).is_none());
        assert!(parse_disk("{\"version\":1,\"saved_at\":1,\"opt").is_none());
    }

    #[test]
    fn forget_failure_clears_only_failures() {
        let failed = cache_key(
            &BaseCodingAgent::copilot(),
            &serde_json::json!("forget-failed"),
        );
        record_attempt(&failed, Some("Not signed in".into()));
        forget_failure(&failed);
        assert!(recent_attempt(&failed).is_none());

        let ok = cache_key(&BaseCodingAgent::copilot(), &serde_json::json!("forget-ok"));
        record_attempt(&ok, None);
        forget_failure(&ok);
        assert!(matches!(recent_attempt(&ok), Some(RecentAttempt::Success)));
    }

    #[test]
    fn disk_entry_drops_repeated_models() {
        let model = |id: &str| ModelInfo {
            id: id.into(),
            name: id.into(),
            provider_id: None,
            reasoning_options: vec![],
        };
        let entry = DiskEntry {
            version: DISK_CACHE_VERSION,
            saved_at: 1,
            options: ExecutorDiscoveredOptions {
                model_selector: ModelSelectorConfig {
                    models: vec![model("auto"), model("auto"), model("kimi-k3")],
                    ..Default::default()
                },
                ..Default::default()
            },
        };
        let parsed = parse_disk(&serde_json::to_string(&entry).unwrap()).unwrap();
        let ids: Vec<_> = parsed.model_selector.models.iter().map(|m| &m.id).collect();
        assert_eq!(ids, ["auto", "kimi-k3"]);
    }

    /// A fake agent that accepts `initialize` and rejects `session/new` with -32000, as a
    /// signed-out Copilot does.
    #[cfg(unix)]
    #[tokio::test]
    async fn signed_out_agent_gives_sign_in_message() {
        let dir = tempfile::TempDir::new().unwrap();
        let script = dir.path().join("agent.sh");
        std::fs::write(
            &script,
            r#"while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":\([^,}]*\).*/\1/p')
  case "$line" in
    *'"initialize"'*) printf '{"jsonrpc":"2.0","id":%s,"result":{"protocolVersion":1,"agentCapabilities":{}}}\n' "$id" ;;
    *'"session/new"'*) echo "auth noise on stderr" >&2
      printf '{"jsonrpc":"2.0","id":%s,"error":{"code":-32000,"message":"Authentication required"}}\n' "$id" ;;
  esac
done
"#,
        )
        .unwrap();
        let mut spec = spec(&[]);
        spec.command = CommandBuilder::new(format!("sh {}", script.display()));
        let (tx, _rx) = mpsc::unbounded_channel();
        assert_eq!(run_live(spec, tx).await, Err(NOT_SIGNED_IN.to_string()));
    }
}
