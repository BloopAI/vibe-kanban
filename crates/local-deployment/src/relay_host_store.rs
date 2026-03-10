use std::{collections::HashMap, sync::Arc};

use relay_types::{RelayAuthState, RemoteSession};
use tokio::sync::RwLock;
use utils::assets::relay_host_credentials_path;
use uuid::Uuid;

#[derive(Debug, Clone, Default)]
struct RelaySessionCacheEntry {
    remote_session_id: Option<Uuid>,
    signing_session_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RelayHostCredentials {
    pub host_name: Option<String>,
    pub paired_at: Option<String>,
    pub client_id: Option<String>,
    pub server_public_key_b64: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RelayHostCredentialSummary {
    pub host_id: Uuid,
    pub host_name: Option<String>,
    pub paired_at: Option<String>,
}

#[derive(Clone)]
pub struct RelayHostStore {
    credentials: Arc<RwLock<HashMap<Uuid, RelayHostCredentials>>>,
    auth_state: Arc<RwLock<HashMap<Uuid, RelaySessionCacheEntry>>>,
}

impl RelayHostStore {
    pub async fn load() -> Self {
        Self {
            credentials: Arc::new(RwLock::new(load_relay_host_credentials_map().await)),
            auth_state: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn load_auth_state(&self, host_id: Uuid) -> Option<RelayAuthState> {
        let sessions = self.auth_state.read().await;
        let entry = sessions.get(&host_id)?;
        let remote_session_id = entry.remote_session_id?;
        let signing_session_id = entry.signing_session_id.clone()?;

        Some(RelayAuthState {
            remote_session: RemoteSession {
                host_id,
                id: remote_session_id,
            },
            signing_session_id,
        })
    }

    pub async fn cache_auth_state(&self, host_id: Uuid, auth_state: &RelayAuthState) {
        let mut sessions = self.auth_state.write().await;
        let entry = sessions.entry(host_id).or_default();
        entry.remote_session_id = Some(auth_state.remote_session.id);
        entry.signing_session_id = Some(auth_state.signing_session_id.clone());
    }

    pub async fn cache_signing_session_id(&self, host_id: Uuid, session_id: String) {
        self.auth_state
            .write()
            .await
            .entry(host_id)
            .or_default()
            .signing_session_id = Some(session_id);
    }

    pub async fn clear_auth_state(&self, host_id: Uuid) {
        self.auth_state.write().await.remove(&host_id);
    }

    pub async fn upsert_credentials(
        &self,
        host_id: Uuid,
        host_name: Option<String>,
        paired_at: Option<String>,
        client_id: Option<String>,
        server_public_key_b64: Option<String>,
    ) -> anyhow::Result<()> {
        let mut credentials = self.credentials.write().await;
        let existing = credentials.get(&host_id).cloned();
        credentials.insert(
            host_id,
            RelayHostCredentials {
                host_name: host_name
                    .or_else(|| existing.as_ref().and_then(|value| value.host_name.clone())),
                paired_at: paired_at
                    .or_else(|| existing.as_ref().and_then(|value| value.paired_at.clone())),
                client_id: client_id
                    .or_else(|| existing.as_ref().and_then(|value| value.client_id.clone())),
                server_public_key_b64: server_public_key_b64.or_else(|| {
                    existing
                        .as_ref()
                        .and_then(|value| value.server_public_key_b64.clone())
                }),
            },
        );

        // Persist while holding the write lock so concurrent upserts cannot
        // write older snapshots after newer updates.
        persist_relay_host_credentials_map(&credentials).await
    }

    pub async fn get_credentials(&self, host_id: Uuid) -> Option<RelayHostCredentials> {
        self.credentials.read().await.get(&host_id).cloned()
    }

    pub async fn list_credentials_summary(&self) -> Vec<RelayHostCredentialSummary> {
        self.credentials
            .read()
            .await
            .iter()
            .map(|(host_id, value)| RelayHostCredentialSummary {
                host_id: *host_id,
                host_name: value.host_name.clone(),
                paired_at: value.paired_at.clone(),
            })
            .collect()
    }

    pub async fn remove_credentials(&self, host_id: Uuid) -> anyhow::Result<bool> {
        let mut credentials = self.credentials.write().await;
        let removed = credentials.remove(&host_id).is_some();

        if removed {
            self.auth_state.write().await.remove(&host_id);
            persist_relay_host_credentials_map(&credentials).await?;
        }

        Ok(removed)
    }
}

async fn load_relay_host_credentials_map() -> HashMap<Uuid, RelayHostCredentials> {
    let path = relay_host_credentials_path();
    let Ok(raw) = tokio::fs::read_to_string(&path).await else {
        return HashMap::new();
    };

    match serde_json::from_str::<HashMap<Uuid, RelayHostCredentials>>(&raw) {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(
                ?error,
                path = %path.display(),
                "Failed to parse relay host credentials file"
            );
            HashMap::new()
        }
    }
}

async fn persist_relay_host_credentials_map(
    map: &HashMap<Uuid, RelayHostCredentials>,
) -> anyhow::Result<()> {
    let path = relay_host_credentials_path();
    let json = serde_json::to_string_pretty(map)?;
    tokio::fs::write(&path, json).await?;
    Ok(())
}
