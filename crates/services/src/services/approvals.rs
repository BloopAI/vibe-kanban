pub mod executor_approvals;

use std::{collections::HashMap, sync::Arc, time::Duration as StdDuration};

use dashmap::DashMap;
use db::models::{
    execution_process::ExecutionProcess,
    task::{Task, TaskStatus},
};
use executors::{
    approvals::ToolCallMetadata,
    logs::{
        ActionType, NormalizedEntry, NormalizedEntryType, ToolStatus,
        utils::patch::{ConversationPatch, extract_normalized_entry_from_patch},
    },
};
use futures::future::{BoxFuture, FutureExt, Shared};
use sqlx::{Error as SqlxError, SqlitePool};
use thiserror::Error;
use tokio::sync::{RwLock, oneshot};
use utils::{
    approvals::{ApprovalRequest, ApprovalResponse, ApprovalStatus, Question},
    log_msg::LogMsg,
    msg_store::MsgStore,
};
use uuid::Uuid;

/// Response data from an approval/question response
#[derive(Debug, Clone)]
pub struct ApprovalResponseData {
    pub status: ApprovalStatus,
    pub answers: Option<HashMap<String, String>>,
}

impl Default for ApprovalResponseData {
    fn default() -> Self {
        Self {
            status: ApprovalStatus::TimedOut,
            answers: None,
        }
    }
}

#[derive(Debug)]
struct PendingApproval {
    entry_index: usize,
    entry: NormalizedEntry,
    execution_process_id: Uuid,
    tool_name: String,
    #[allow(dead_code)]
    questions: Option<Vec<Question>>,
    requested_at: chrono::DateTime<chrono::Utc>,
    response_tx: oneshot::Sender<ApprovalResponseData>,
}

type ApprovalWaiter = Shared<BoxFuture<'static, ApprovalResponseData>>;

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

    pub async fn create_with_waiter(
        &self,
        request: ApprovalRequest,
    ) -> Result<(ApprovalRequest, ApprovalWaiter), ApprovalError> {
        let (tx, rx) = oneshot::channel();
        let waiter: ApprovalWaiter = rx.map(|result| result.unwrap_or_default()).boxed().shared();
        let req_id = request.id.clone();
        let is_question = request.questions.is_some();

        // Debug logging for AskUserQuestion flow
        tracing::info!(
            req_id = %req_id,
            tool_name = %request.tool_name,
            tool_call_id = %request.tool_call_id,
            has_questions = %is_question,
            questions_count = request.questions.as_ref().map(|q| q.len()).unwrap_or(0),
            "create_with_waiter: Processing approval request"
        );

        if let Some(store) = self.msg_store_by_id(&request.execution_process_id).await {
            // Retry finding the entry with backoff (handles race condition where
            // the log processor hasn't created the entry yet)
            let mut matching_tool = None;
            let retry_delays = [50, 100, 200, 400]; // Total max wait: 750ms

            for (attempt, delay_ms) in retry_delays.iter().enumerate() {
                matching_tool = find_matching_tool_use(store.clone(), &request.tool_call_id);

                if matching_tool.is_some() {
                    break;
                }

                tracing::debug!(
                    "Retry {}/{}: Entry not found for tool_call_id '{}', waiting {}ms",
                    attempt + 1,
                    retry_delays.len(),
                    request.tool_call_id,
                    delay_ms
                );
                tokio::time::sleep(std::time::Duration::from_millis(*delay_ms)).await;
            }

            if let Some((idx, matching_tool)) = matching_tool {
                tracing::info!(
                    req_id = %req_id,
                    entry_index = idx,
                    "create_with_waiter: Found matching tool entry"
                );

                // Use PendingQuestion status for AskUserQuestion, PendingApproval otherwise
                let tool_status = if let Some(ref questions) = request.questions {
                    tracing::info!(
                        req_id = %req_id,
                        "create_with_waiter: Using PendingQuestion status (has questions)"
                    );
                    ToolStatus::PendingQuestion {
                        question_id: req_id.clone(),
                        questions: questions.clone(),
                        requested_at: request.created_at,
                        timeout_at: request.timeout_at,
                    }
                } else {
                    tracing::info!(
                        req_id = %req_id,
                        "create_with_waiter: Using PendingApproval status (no questions)"
                    );
                    ToolStatus::PendingApproval {
                        approval_id: req_id.clone(),
                        requested_at: request.created_at,
                        timeout_at: request.timeout_at,
                    }
                };

                let approval_entry = matching_tool
                    .with_tool_status(tool_status)
                    .ok_or(ApprovalError::NoToolUseEntry)?;
                store.push_patch(ConversationPatch::replace(idx, approval_entry));

                self.pending.insert(
                    req_id.clone(),
                    PendingApproval {
                        entry_index: idx,
                        entry: matching_tool,
                        execution_process_id: request.execution_process_id,
                        tool_name: request.tool_name.clone(),
                        questions: request.questions.clone(),
                        requested_at: request.created_at,
                        response_tx: tx,
                    },
                );
                tracing::debug!(
                    "Created {} {} for tool '{}' at entry index {}",
                    if is_question { "question" } else { "approval" },
                    req_id,
                    request.tool_name,
                    idx
                );
            } else if let Some(ref questions) = request.questions {
                // For AskUserQuestion, create entry directly if not found
                // This handles the race condition where log processor is slow
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: "AskUserQuestion".to_string(),
                        action_type: ActionType::Tool {
                            tool_name: "AskUserQuestion".to_string(),
                            arguments: Some(serde_json::json!({ "questions": questions })),
                            result: None,
                        },
                        status: ToolStatus::Created,
                    },
                    content: if questions.len() == 1 {
                        questions[0].question.clone()
                    } else {
                        format!("{} questions", questions.len())
                    },
                    metadata: Some(serde_json::json!({ "tool_call_id": request.tool_call_id })),
                };

                let idx = store.get_history().len();
                let tool_status = ToolStatus::PendingQuestion {
                    question_id: req_id.clone(),
                    questions: questions.clone(),
                    requested_at: request.created_at,
                    timeout_at: request.timeout_at,
                };

                if let Some(approval_entry) = entry.clone().with_tool_status(tool_status) {
                    store.push_patch(ConversationPatch::add_normalized_entry(idx, approval_entry));

                    self.pending.insert(
                        req_id.clone(),
                        PendingApproval {
                            entry_index: idx,
                            entry,
                            execution_process_id: request.execution_process_id,
                            tool_name: request.tool_name.clone(),
                            questions: request.questions.clone(),
                            requested_at: request.created_at,
                            response_tx: tx,
                        },
                    );

                    tracing::info!(
                        "Created AskUserQuestion entry directly (log processor was slow): question_id={}, tool_call_id='{}'",
                        req_id,
                        request.tool_call_id
                    );
                }
            } else {
                tracing::warn!(
                    "No matching tool use entry found after {} retries: tool='{}', tool_call_id='{}', execution_process_id={}",
                    retry_delays.len(),
                    request.tool_name,
                    request.tool_call_id,
                    request.execution_process_id
                );
            }
        } else {
            tracing::warn!(
                "No msg_store found for execution_process_id: {}",
                request.execution_process_id
            );
        }

        self.spawn_timeout_watcher(req_id.clone(), request.timeout_at, waiter.clone());
        Ok((request, waiter))
    }

    #[tracing::instrument(skip(self, id, req))]
    pub async fn respond(
        &self,
        pool: &SqlitePool,
        id: &str,
        req: ApprovalResponse,
    ) -> Result<(ApprovalStatus, ToolContext), ApprovalError> {
        tracing::info!(
            approval_id = %id,
            status = ?req.status,
            answers = ?req.answers,
            "Approval respond called"
        );

        if let Some((_, p)) = self.pending.remove(id) {
            self.completed.insert(id.to_string(), req.status.clone());

            // Send response data including answers if present
            let response_data = ApprovalResponseData {
                status: req.status.clone(),
                answers: req.answers.clone(),
            };

            match p.response_tx.send(response_data) {
                Ok(()) => {
                    tracing::info!(
                        approval_id = %id,
                        answers = ?req.answers,
                        "Approval response sent successfully to executor"
                    );
                }
                Err(failed_data) => {
                    tracing::error!(
                        approval_id = %id,
                        answers = ?failed_data.answers,
                        "Failed to send approval response - receiver dropped"
                    );
                }
            }

            if let Some(store) = self.msg_store_by_id(&p.execution_process_id).await {
                // Use from_approval_response to include answers in the status if present
                let status = ToolStatus::from_approval_response(&req.status, req.answers.as_ref())
                    .ok_or(ApprovalError::Custom(anyhow::anyhow!(
                        "Invalid approval status"
                    )))?;
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

            // If approved or denied, and task is still InReview, move back to InProgress
            if matches!(
                req.status,
                ApprovalStatus::Approved | ApprovalStatus::Denied { .. }
            ) && let Ok(ctx) =
                ExecutionProcess::load_context(pool, tool_ctx.execution_process_id).await
                && ctx.task.status == TaskStatus::InReview
                && let Err(e) = Task::update_status(pool, ctx.task.id, TaskStatus::InProgress).await
            {
                tracing::warn!(
                    "Failed to update task status to InProgress after approval response: {}",
                    e
                );
            }

            Ok((req.status, tool_ctx))
        } else if self.completed.contains_key(id) {
            Err(ApprovalError::AlreadyCompleted)
        } else {
            Err(ApprovalError::NotFound)
        }
    }

    #[tracing::instrument(skip(self, id, timeout_at, waiter))]
    fn spawn_timeout_watcher(
        &self,
        id: String,
        timeout_at: chrono::DateTime<chrono::Utc>,
        waiter: ApprovalWaiter,
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
            let response_data = tokio::select! {
                biased;

                resolved = waiter.clone() => resolved,
                _ = tokio::time::sleep_until(deadline) => ApprovalResponseData::default(),
            };

            let is_timeout = matches!(&response_data.status, ApprovalStatus::TimedOut);
            completed.insert(id.clone(), response_data.status.clone());

            if is_timeout && let Some((_, pending_approval)) = pending.remove(&id) {
                if pending_approval
                    .response_tx
                    .send(response_data.clone())
                    .is_err()
                {
                    tracing::debug!("approval '{}' timeout notification receiver dropped", id);
                }

                let store = {
                    let map = msg_stores.read().await;
                    map.get(&pending_approval.execution_process_id).cloned()
                };

                if let Some(store) = store {
                    // Use the new timed_out_with_duration to include how long we waited
                    let timeout_status =
                        ToolStatus::timed_out_with_duration(pending_approval.requested_at);
                    if let Some(updated_entry) =
                        pending_approval.entry.with_tool_status(timeout_status)
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

    /// Cancel all pending approvals for a process that is exiting.
    ///
    /// Resolves each pending approval with `Denied` (not `TimedOut`) so the
    /// background timeout watcher's `is_timeout` guard is false — it won't try
    /// to update the MsgStore after it has already been removed from the map.
    /// Must be called before the MsgStore is removed from the container.
    pub fn cancel_for_process(&self, execution_process_id: Uuid) {
        let to_cancel: Vec<String> = self
            .pending
            .iter()
            .filter(|entry| entry.value().execution_process_id == execution_process_id)
            .map(|entry| entry.key().clone())
            .collect();

        for id in to_cancel {
            if let Some((_, approval)) = self.pending.remove(&id) {
                let status = ApprovalStatus::Denied {
                    reason: Some("Process exited".to_string()),
                };
                self.completed.insert(id, status.clone());
                // Send the cancellation; ignore error if receiver already dropped
                let _ = approval.response_tx.send(ApprovalResponseData {
                    status,
                    answers: None,
                });
            }
        }
    }

    async fn msg_store_by_id(&self, execution_process_id: &Uuid) -> Option<Arc<MsgStore>> {
        let map = self.msg_stores.read().await;
        map.get(execution_process_id).cloned()
    }
}

pub(crate) async fn ensure_task_in_review(pool: &SqlitePool, execution_process_id: Uuid) {
    if let Ok(ctx) = ExecutionProcess::load_context(pool, execution_process_id).await
        && ctx.task.status == TaskStatus::InProgress
        && let Err(e) = Task::update_status(pool, ctx.task.id, TaskStatus::InReview).await
    {
        tracing::warn!(
            "Failed to update task status to InReview for approval request: {}",
            e
        );
    }
}

/// Find a matching tool use entry that hasn't been assigned to an approval yet
/// Matches by tool call id from tool metadata
fn find_matching_tool_use(
    store: Arc<MsgStore>,
    tool_call_id: &str,
) -> Option<(usize, NormalizedEntry)> {
    let history = store.get_history();

    // Single loop through history
    for msg in history.iter().rev() {
        if let LogMsg::JsonPatch(patch) = msg
            && let Some((idx, entry)) = extract_normalized_entry_from_patch(patch)
            && let NormalizedEntryType::ToolUse { status, .. } = &entry.entry_type
        {
            // Only match tools that are in Created state
            if !matches!(status, ToolStatus::Created) {
                continue;
            }

            // Match by tool call id from metadata
            if let Some(metadata) = &entry.metadata
                && let Ok(ToolCallMetadata {
                    tool_call_id: entry_call_id,
                    ..
                }) = serde_json::from_value::<ToolCallMetadata>(metadata.clone())
                && entry_call_id == tool_call_id
            {
                tracing::debug!(
                    "Matched tool use entry at index {idx} for tool call id '{tool_call_id}'"
                );
                return Some((idx, entry));
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use executors::logs::{ActionType, NormalizedEntry, NormalizedEntryType, ToolStatus};
    use utils::{
        approvals::{Question, QuestionOption},
        msg_store::MsgStore,
    };

    use super::*;

    fn create_tool_use_entry(
        tool_name: &str,
        file_path: &str,
        id: &str,
        status: ToolStatus,
    ) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: tool_name.to_string(),
                action_type: ActionType::FileRead {
                    path: file_path.to_string(),
                },
                status,
            },
            content: format!("Reading {file_path}"),
            metadata: Some(
                serde_json::to_value(ToolCallMetadata {
                    tool_call_id: id.to_string(),
                })
                .unwrap(),
            ),
        }
    }

    fn create_ask_user_question_entry(id: &str, status: ToolStatus) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "AskUserQuestion".to_string(),
                action_type: ActionType::Tool {
                    tool_name: "AskUserQuestion".to_string(),
                    arguments: None,
                    result: None,
                },
                status,
            },
            content: "AskUserQuestion".to_string(),
            metadata: Some(
                serde_json::to_value(ToolCallMetadata {
                    tool_call_id: id.to_string(),
                })
                .unwrap(),
            ),
        }
    }

    fn create_test_questions() -> Vec<Question> {
        vec![Question {
            question: "Which testing approach do you prefer?".to_string(),
            header: "Testing".to_string(),
            multi_select: false,
            options: vec![
                QuestionOption {
                    label: "Unit Tests".to_string(),
                    description: "Test individual functions".to_string(),
                },
                QuestionOption {
                    label: "Integration Tests".to_string(),
                    description: "Test component interactions".to_string(),
                },
            ],
        }]
    }

    #[test]
    fn test_parallel_tool_call_approval_matching() {
        let store = Arc::new(MsgStore::new());

        // Setup: Simulate 3 parallel Read tool calls with different files
        let read_foo = create_tool_use_entry("Read", "foo.rs", "foo-id", ToolStatus::Created);
        let read_bar = create_tool_use_entry("Read", "bar.rs", "bar-id", ToolStatus::Created);
        let read_baz = create_tool_use_entry("Read", "baz.rs", "baz-id", ToolStatus::Created);

        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(0, read_foo),
        );
        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(1, read_bar),
        );
        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(2, read_baz),
        );

        let (idx_foo, _) =
            find_matching_tool_use(store.clone(), "foo-id").expect("Should match foo.rs");
        let (idx_bar, _) =
            find_matching_tool_use(store.clone(), "bar-id").expect("Should match bar.rs");
        let (idx_baz, _) =
            find_matching_tool_use(store.clone(), "baz-id").expect("Should match baz.rs");

        assert_eq!(idx_foo, 0, "foo.rs should match first entry");
        assert_eq!(idx_bar, 1, "bar.rs should match second entry");
        assert_eq!(idx_baz, 2, "baz.rs should match third entry");

        // Test 2: Already pending tools are skipped
        let read_pending = create_tool_use_entry(
            "Read",
            "pending.rs",
            "pending-id",
            ToolStatus::PendingApproval {
                approval_id: "test-id".to_string(),
                requested_at: chrono::Utc::now(),
                timeout_at: chrono::Utc::now(),
            },
        );
        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(3, read_pending),
        );

        assert!(
            find_matching_tool_use(store.clone(), "pending-id").is_none(),
            "Should not match tools in PendingApproval state"
        );

        // Test 3: Wrong tool id returns None
        assert!(
            find_matching_tool_use(store.clone(), "wrong-id").is_none(),
            "Should not match different tool ids"
        );
    }

    #[test]
    fn test_find_matching_tool_use_with_ask_user_question() {
        let store = Arc::new(MsgStore::new());

        // Setup: Create an AskUserQuestion tool use entry in Created state
        let ask_entry = create_ask_user_question_entry("ask-id-123", ToolStatus::Created);
        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(0, ask_entry),
        );

        // Test: Should find the AskUserQuestion entry by tool call id
        let result = find_matching_tool_use(store.clone(), "ask-id-123");
        assert!(result.is_some(), "Should find AskUserQuestion entry");
        let (idx, entry) = result.unwrap();
        assert_eq!(idx, 0, "Entry should be at index 0");
        if let NormalizedEntryType::ToolUse { tool_name, .. } = &entry.entry_type {
            assert_eq!(tool_name, "AskUserQuestion");
        } else {
            panic!("Entry should be a ToolUse type");
        }

        // Test: Entry in PendingQuestion state should NOT be matched
        let pending_entry = create_ask_user_question_entry(
            "ask-pending-id",
            ToolStatus::PendingQuestion {
                question_id: "q-1".to_string(),
                questions: create_test_questions(),
                requested_at: chrono::Utc::now(),
                timeout_at: chrono::Utc::now(),
            },
        );
        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(
                1,
                pending_entry,
            ),
        );
        assert!(
            find_matching_tool_use(store.clone(), "ask-pending-id").is_none(),
            "Should not match tools in PendingQuestion state"
        );
    }

    #[tokio::test]
    async fn test_ask_user_question_entry_status_update() {
        use std::collections::HashMap;
        use tokio::sync::RwLock;
        use utils::approvals::ApprovalRequest;

        let execution_process_id = Uuid::new_v4();

        // Create a msg store with an AskUserQuestion entry in Created state
        let store = Arc::new(MsgStore::new());
        let ask_entry = create_ask_user_question_entry("auq-tool-call-123", ToolStatus::Created);
        store.push_patch(
            executors::logs::utils::patch::ConversationPatch::add_normalized_entry(0, ask_entry),
        );

        // Create Approvals service with the msg store registered
        let mut stores_map = HashMap::new();
        stores_map.insert(execution_process_id, store.clone());
        let msg_stores = Arc::new(RwLock::new(stores_map));
        let approvals = Approvals::new(msg_stores);

        // Create approval request with questions (simulating AskUserQuestion)
        let questions = create_test_questions();
        let request = ApprovalRequest::from_questions(
            questions.clone(),
            "auq-tool-call-123".to_string(),
            execution_process_id,
        );

        // Call create_with_waiter
        let result = approvals.create_with_waiter(request).await;
        assert!(result.is_ok(), "create_with_waiter should succeed");

        // Verify the entry status was updated to PendingQuestion
        let history = store.get_history();
        // Find the latest patch for index 0
        let mut found_pending_question = false;
        for msg in history.iter().rev() {
            if let LogMsg::JsonPatch(patch) = msg
                && let Some((idx, entry)) =
                    executors::logs::utils::patch::extract_normalized_entry_from_patch(patch)
                && idx == 0
            {
                if let NormalizedEntryType::ToolUse { status, .. } = &entry.entry_type
                    && matches!(status, ToolStatus::PendingQuestion { .. })
                {
                    found_pending_question = true;
                    // Verify questions are included
                    if let ToolStatus::PendingQuestion {
                        questions: q,
                        question_id,
                        ..
                    } = status
                    {
                        assert!(!question_id.is_empty(), "question_id should be set");
                        assert_eq!(q.len(), questions.len(), "Questions should match");
                    }
                }
                break;
            }
        }
        assert!(
            found_pending_question,
            "Entry should be updated to PendingQuestion status"
        );
    }
}
