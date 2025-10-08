use std::{collections::HashMap, sync::Arc, time::Duration as StdDuration};

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use db::models::executor_session::ExecutorSession;
use executors::logs::{
    NormalizedEntry, NormalizedEntryType, ToolStatus,
    utils::patch::{ConversationPatch, extract_normalized_entry_from_patch},
};
use sqlx::{Error as SqlxError, SqlitePool};
use thiserror::Error;
use tokio::sync::{RwLock, oneshot};
use utils::{
    approvals::{
        ApprovalPendingInfo, ApprovalRequest, ApprovalResponse, ApprovalStatus,
        CreateApprovalRequest,
    },
    log_msg::LogMsg,
    msg_store::MsgStore,
};
use uuid::Uuid;

#[derive(Debug)]
struct PendingApproval {
    entry_index: usize,
    entry: NormalizedEntry,
    execution_process_id: Uuid,
    tool_name: String,
    requested_at: DateTime<Utc>,
    timeout_at: DateTime<Utc>,
    response_tx: oneshot::Sender<ApprovalStatus>,
}

#[derive(Debug)]
pub struct ToolContext {
    pub tool_name: String,
    pub execution_process_id: Uuid,
}

#[derive(Clone)]
pub struct Approvals {
    pending: Arc<DashMap<String, PendingApproval>>,
    completed: Arc<DashMap<String, ApprovalStatus>>,
    msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
}

#[derive(Debug, Error)]
pub enum ApprovalError {
    #[error("approval request not found")]
    NotFound,
    #[error("approval request already completed")]
    AlreadyCompleted,
    #[error("no executor session found for session_id: {0}")]
    NoExecutorSession(String),
    #[error("corresponding tool use entry not found for approval request")]
    NoToolUseEntry,
    #[error(transparent)]
    Custom(#[from] anyhow::Error),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
}

impl Approvals {
    pub fn new(msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>) -> Self {
        Self {
            pending: Arc::new(DashMap::new()),
            completed: Arc::new(DashMap::new()),
            msg_stores,
        }
    }

    #[tracing::instrument(skip(self, request))]
    pub async fn create(&self, request: ApprovalRequest) -> Result<ApprovalRequest, ApprovalError> {
        let (tx, rx) = oneshot::channel();
        let req_id = request.id.clone();

        if let Some(store) = self.msg_store_by_id(&request.execution_process_id).await {
            // Find the matching tool use entry by name and input
            let matching_tool =
                find_matching_tool_use(store.clone(), &request.tool_name, &request.tool_input);

            if let Some((idx, matching_tool)) = matching_tool {
                let approval_entry = matching_tool
                    .with_tool_status(ToolStatus::PendingApproval {
                        approval_id: req_id.clone(),
                        requested_at: request.created_at,
                        timeout_at: request.timeout_at,
                    })
                    .ok_or(ApprovalError::NoToolUseEntry)?;
                store.push_patch(ConversationPatch::replace(idx, approval_entry));

                self.pending.insert(
                    req_id.clone(),
                    PendingApproval {
                        entry_index: idx,
                        entry: matching_tool,
                        execution_process_id: request.execution_process_id,
                        tool_name: request.tool_name.clone(),
                        requested_at: request.created_at,
                        timeout_at: request.timeout_at,
                        response_tx: tx,
                    },
                );
                tracing::debug!(
                    "Created approval {} for tool '{}' at entry index {}",
                    req_id,
                    request.tool_name,
                    idx
                );
            } else {
                tracing::warn!(
                    "No matching tool use entry found for approval request: tool='{}', execution_process_id={}",
                    request.tool_name,
                    request.execution_process_id
                );
            }
        } else {
            tracing::warn!(
                "No msg_store found for execution_process_id: {}",
                request.execution_process_id
            );
        }

        self.spawn_timeout_watcher(req_id.clone(), request.timeout_at, rx);
        Ok(request)
    }

    pub async fn create_from_session(
        &self,
        pool: &SqlitePool,
        payload: CreateApprovalRequest,
    ) -> Result<ApprovalRequest, ApprovalError> {
        let session_id = payload.session_id.clone();
        let execution_process_id =
            match ExecutorSession::find_by_session_id(pool, &session_id).await? {
                Some(session) => session.execution_process_id,
                None => {
                    tracing::warn!("No executor session found for session_id: {}", session_id);
                    return Err(ApprovalError::NoExecutorSession(session_id));
                }
            };

        let request = ApprovalRequest::from_create(payload, execution_process_id);
        self.create(request).await
    }

    #[tracing::instrument(skip(self, id, req))]
    pub async fn respond(
        &self,
        id: &str,
        req: ApprovalResponse,
    ) -> Result<(ApprovalStatus, ToolContext), ApprovalError> {
        if let Some((_, p)) = self.pending.remove(id) {
            self.completed.insert(id.to_string(), req.status.clone());
            let _ = p.response_tx.send(req.status.clone());

            if let Some(store) = self.msg_store_by_id(&p.execution_process_id).await {
                let status = ToolStatus::from_approval_status(&req.status).ok_or(
                    ApprovalError::Custom(anyhow::anyhow!("Invalid approval status")),
                )?;
                let updated_entry = p
                    .entry
                    .with_tool_status(status)
                    .ok_or(ApprovalError::NoToolUseEntry)?;

                store.push_patch(ConversationPatch::replace(p.entry_index, updated_entry));
            } else {
                tracing::warn!(
                    "No msg_store found for execution_process_id: {}",
                    p.execution_process_id
                );
            }

            let tool_ctx = ToolContext {
                tool_name: p.tool_name,
                execution_process_id: p.execution_process_id,
            };
            Ok((req.status, tool_ctx))
        } else if self.completed.contains_key(id) {
            Err(ApprovalError::AlreadyCompleted)
        } else {
            Err(ApprovalError::NotFound)
        }
    }

    pub async fn status(&self, id: &str) -> Option<ApprovalStatus> {
        if let Some(f) = self.completed.get(id) {
            return Some(f.clone());
        }
        if let Some(p) = self.pending.get(id) {
            if chrono::Utc::now() >= p.timeout_at {
                return Some(ApprovalStatus::TimedOut);
            }
            return Some(ApprovalStatus::Pending);
        }
        None
    }

    pub async fn pending(&self) -> Vec<ApprovalPendingInfo> {
        self.pending
            .iter()
            .filter_map(|entry| {
                let (id, pending) = entry.pair();

                match &pending.entry.entry_type {
                    NormalizedEntryType::ToolUse { tool_name, .. } => Some(ApprovalPendingInfo {
                        approval_id: id.clone(),
                        execution_process_id: pending.execution_process_id,
                        tool_name: tool_name.clone(),
                        requested_at: pending.requested_at,
                        timeout_at: pending.timeout_at,
                    }),
                    _ => None,
                }
            })
            .collect()
    }

    #[tracing::instrument(skip(self, id, timeout_at, rx))]
    fn spawn_timeout_watcher(
        &self,
        id: String,
        timeout_at: chrono::DateTime<chrono::Utc>,
        mut rx: oneshot::Receiver<ApprovalStatus>,
    ) {
        let pending = self.pending.clone();
        let completed = self.completed.clone();
        let msg_stores = self.msg_stores.clone();

        let now = chrono::Utc::now();
        let to_wait = (timeout_at - now)
            .to_std()
            .unwrap_or_else(|_| StdDuration::from_secs(0));
        let deadline = tokio::time::Instant::now() + to_wait;

        tokio::spawn(async move {
            let status = tokio::select! {
                biased;

                r = &mut rx => match r {
                    Ok(status) => status,
                    Err(_canceled) => ApprovalStatus::TimedOut,
                },
                _ = tokio::time::sleep_until(deadline) => ApprovalStatus::TimedOut,
            };

            let is_timeout = matches!(&status, ApprovalStatus::TimedOut);
            completed.insert(id.clone(), status.clone());

            let removed = pending.remove(&id);

            if is_timeout && let Some((_, pending_approval)) = removed {
                let store = {
                    let map = msg_stores.read().await;
                    map.get(&pending_approval.execution_process_id).cloned()
                };

                if let Some(store) = store {
                    if let Some(updated_entry) = pending_approval
                        .entry
                        .with_tool_status(ToolStatus::TimedOut)
                    {
                        store.push_patch(ConversationPatch::replace(
                            pending_approval.entry_index,
                            updated_entry,
                        ));
                    } else {
                        tracing::warn!(
                            "Timed out approval '{}' but couldn't update tool status (no tool-use entry).",
                            id
                        );
                    }
                } else {
                    tracing::warn!(
                        "No msg_store found for execution_process_id: {}",
                        pending_approval.execution_process_id
                    );
                }
            }
        });
    }

    async fn msg_store_by_id(&self, execution_process_id: &Uuid) -> Option<Arc<MsgStore>> {
        let map = self.msg_stores.read().await;
        map.get(execution_process_id).cloned()
    }
}

/// Find a matching tool use entry that hasn't been assigned to an approval yet
/// Matches by tool name and tool input to support parallel tool calls
fn find_matching_tool_use(
    store: Arc<MsgStore>,
    tool_name: &str,
    tool_input: &serde_json::Value,
) -> Option<(usize, NormalizedEntry)> {
    use executors::executors::claude::ClaudeToolData;

    let history = store.get_history();

    // Parse the incoming tool_input into ClaudeToolData for proper comparison
    // This handles all the serde aliases and field variations
    let approval_tool_data: ClaudeToolData = match serde_json::from_value(serde_json::json!({
        "name": tool_name,
        "input": tool_input
    })) {
        Ok(data) => data,
        Err(e) => {
            tracing::warn!(
                "Failed to deserialize tool_input for tool '{}': {}",
                tool_name,
                e
            );
            return None;
        }
    };

    // Search backward through history for a matching tool use
    for msg in history.iter().rev() {
        if let LogMsg::JsonPatch(patch) = msg
            && let Some((idx, entry)) = extract_normalized_entry_from_patch(patch)
        {
            if let NormalizedEntryType::ToolUse {
                tool_name: entry_tool_name,
                status,
                ..
            } = &entry.entry_type
            {
                // Only match tools that are in Created state (not already pending approval)
                if !matches!(status, ToolStatus::Created) {
                    continue;
                }

                // Tool name must match
                if entry_tool_name != tool_name {
                    continue;
                }

                // Extract and deserialize the tool data from metadata
                if let Some(metadata) = &entry.metadata {
                    // Deserialize the stored tool data
                    if let Ok(entry_tool_data) =
                        serde_json::from_value::<ClaudeToolData>(metadata.clone())
                    {
                        // Compare the deserialized tool data structures
                        if entry_tool_data == approval_tool_data {
                            tracing::debug!(
                                "Matched tool use entry at index {idx} for tool '{tool_name}' by deserialized tool data"
                            );
                            return Some((idx, entry));
                        }
                    }
                }
                // Input doesn't match or deserialization failed, continue searching
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use executors::logs::{ActionType, NormalizedEntry, NormalizedEntryType, ToolStatus};
    use utils::msg_store::MsgStore;

    use super::*;

    fn create_tool_use_entry(
        tool_name: &str,
        file_path: &str,
        status: ToolStatus,
    ) -> NormalizedEntry {
        // Create metadata that mimics the actual structure from Claude Code
        // which has an "input" field containing the original tool parameters
        let metadata = serde_json::json!({
            "type": "tool_use",
            "id": format!("test-{}", file_path),
            "name": tool_name,
            "input": {
                "file_path": file_path
            }
        });

        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: tool_name.to_string(),
                action_type: ActionType::FileRead {
                    path: file_path.to_string(),
                },
                status,
            },
            content: format!("Reading {}", file_path),
            metadata: Some(metadata),
        }
    }

    #[test]
    fn test_parallel_tool_call_approval_matching() {
        let store = Arc::new(MsgStore::new());

        // Setup: Simulate 3 parallel Read tool calls with different files
        let read_foo = create_tool_use_entry("Read", "foo.rs", ToolStatus::Created);
        let read_bar = create_tool_use_entry("Read", "bar.rs", ToolStatus::Created);
        let read_baz = create_tool_use_entry("Read", "baz.rs", ToolStatus::Created);

        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(0, read_foo),
        );
        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(1, read_bar),
        );
        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(2, read_baz),
        );

        // Test 1: Each approval request matches its specific tool by input
        let foo_input = serde_json::json!({"file_path": "foo.rs"});
        let bar_input = serde_json::json!({"file_path": "bar.rs"});
        let baz_input = serde_json::json!({"file_path": "baz.rs"});

        let (idx_foo, _) =
            find_matching_tool_use(store.clone(), "Read", &foo_input).expect("Should match foo.rs");
        let (idx_bar, _) =
            find_matching_tool_use(store.clone(), "Read", &bar_input).expect("Should match bar.rs");
        let (idx_baz, _) =
            find_matching_tool_use(store.clone(), "Read", &baz_input).expect("Should match baz.rs");

        assert_eq!(idx_foo, 0, "foo.rs should match first entry");
        assert_eq!(idx_bar, 1, "bar.rs should match second entry");
        assert_eq!(idx_baz, 2, "baz.rs should match third entry");

        // Test 2: Already pending tools are skipped
        let read_pending = create_tool_use_entry(
            "Read",
            "pending.rs",
            ToolStatus::PendingApproval {
                approval_id: "test-id".to_string(),
                requested_at: chrono::Utc::now(),
                timeout_at: chrono::Utc::now(),
            },
        );
        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(3, read_pending),
        );

        let pending_input = serde_json::json!({"file_path": "pending.rs"});
        assert!(
            find_matching_tool_use(store.clone(), "Read", &pending_input).is_none(),
            "Should not match tools in PendingApproval state"
        );

        // Test 3: Wrong tool name returns None
        let write_input = serde_json::json!({"file_path": "foo.rs", "content": "test"});
        assert!(
            find_matching_tool_use(store.clone(), "Write", &write_input).is_none(),
            "Should not match different tool names"
        );

        // Test 4: Wrong input parameters returns None
        let wrong_input = serde_json::json!({"file_path": "nonexistent.rs"});
        assert!(
            find_matching_tool_use(store.clone(), "Read", &wrong_input).is_none(),
            "Should not match with different input parameters"
        );
    }
}
