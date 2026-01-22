use std::{
    collections::{HashMap, HashSet},
    sync::{LazyLock, Mutex},
};

use serde_json::Value;

use crate::executors::opencode::{
    sdk::EventStreamContext,
    types::{MessageRole, OpencodeExecutorEvent, ProviderListResponse, SdkEvent},
};

type ProviderId = String;
type ModelId = String;
type ContextWindowTokens = u32;

// Maps (Provider, Model) -> Context Window
type ModelContextWindows = HashMap<(ProviderId, ModelId), ContextWindowTokens>;

/// Cache entry for model context windows.
/// Keyed by a config-derived cache key (based on env vars + base command)
/// rather than directory, since configuration determines available models.
#[derive(Default)]
struct ModelCacheEntry {
    context_windows: ModelContextWindows,
    /// Negative cache for models that were requested but not found.
    /// Prevents repeated API calls for models that don't return context info.
    unknown_models: HashSet<(ProviderId, ModelId)>,
}

struct ModelContextCache {
    entries: Mutex<HashMap<String, ModelCacheEntry>>,
}

impl ModelContextCache {
    fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    fn get(&self, cache_key: &str, provider: &str, model: &str) -> Option<u32> {
        let map = self.entries.lock().unwrap();
        let entry = map.get(cache_key)?;

        entry
            .context_windows
            .get(&(provider.to_string(), model.to_string()))
            .copied()
            .or_else(|| {
                entry
                    .unknown_models
                    .contains(&(provider.to_string(), model.to_string()))
                    .then_some(0)
            })
    }

    fn update(
        &self,
        cache_key: &str,
        provider: &str,
        model: &str,
        fetched_windows: ModelContextWindows,
    ) -> u32 {
        let mut cache = self.entries.lock().unwrap();
        let entry = cache.entry(cache_key.to_string()).or_default();

        entry.context_windows.extend(fetched_windows);
        entry
            .unknown_models
            .retain(|key| !entry.context_windows.contains_key(key));

        entry
            .context_windows
            .get(&(provider.to_string(), model.to_string()))
            .copied()
            .unwrap_or_else(|| {
                entry
                    .unknown_models
                    .insert((provider.to_string(), model.to_string()));
                0
            })
    }
}

static CONTEXT_WINDOWS_CACHE: LazyLock<ModelContextCache> = LazyLock::new(ModelContextCache::new);

async fn get_model_context_window(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
    cache_key: &str,
    provider_id: &str,
    model_id: &str,
) -> u32 {
    if let Some(cached) = CONTEXT_WINDOWS_CACHE.get(cache_key, provider_id, model_id) {
        return cached;
    }

    let Some(fetched) = fetch_model_context_windows(client, base_url, directory).await else {
        return 0;
    };
    CONTEXT_WINDOWS_CACHE.update(cache_key, provider_id, model_id, fetched)
}

pub(super) async fn maybe_emit_token_usage(context: &EventStreamContext<'_>, event: &Value) {
    let Some(SdkEvent::MessageUpdated(event)) = SdkEvent::parse(event) else {
        return;
    };
    let message = event.info;

    if message.role != MessageRole::Assistant {
        return;
    }

    let Some(ref tokens) = message.tokens else {
        return;
    };

    let total_tokens =
        tokens.input + tokens.output + tokens.cache.as_ref().map(|c| c.read).unwrap_or(0);

    if total_tokens == 0 {
        return;
    }

    let provider_id = message.provider_id();
    let model_id = message.model_id();

    let model_context_window = match (provider_id, model_id) {
        (Some(provider), Some(model)) => {
            get_model_context_window(
                context.client,
                context.base_url,
                context.directory,
                context.models_cache_key,
                provider,
                model,
            )
            .await
        }
        _ => 0,
    };

    if model_context_window == 0 {
        return;
    }

    let _ = context
        .log_writer
        .log_event(&OpencodeExecutorEvent::TokenUsage {
            total_tokens,
            model_context_window,
        })
        .await;
}

async fn fetch_model_context_windows(
    client: &reqwest::Client,
    base_url: &str,
    directory: &str,
) -> Option<ModelContextWindows> {
    let response = match client
        .get(format!("{base_url}/provider"))
        .query(&[("directory", directory)])
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(err) => {
            tracing::debug!("OpenCode provider list request failed: {err}");
            return None;
        }
    };

    if !response.status().is_success() {
        tracing::debug!(
            "OpenCode provider list request failed with HTTP {}",
            response.status()
        );
        return None;
    }

    let parsed = match response.json::<ProviderListResponse>().await {
        Ok(parsed) => parsed,
        Err(err) => {
            tracing::debug!("OpenCode provider list response parse failed: {err}");
            return None;
        }
    };

    let mut windows: ModelContextWindows = HashMap::new();
    for provider in parsed.all {
        for (model_id, info) in provider.models {
            let context_window = info.limit.context;
            if context_window > 0 {
                windows.insert((provider.id.clone(), model_id), context_window);
            }
        }
    }

    Some(windows)
}
