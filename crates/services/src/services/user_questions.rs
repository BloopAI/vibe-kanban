use std::{collections::HashMap, sync::Arc, time::Duration as StdDuration};

use dashmap::DashMap;
use db::models::execution_process::ExecutionProcess;
use executors::logs::{
    NormalizedEntry, NormalizedEntryType, QuestionStatus,
    utils::patch::{ConversationPatch, extract_normalized_entry_from_patch},
};
use futures::future::{BoxFuture, FutureExt, Shared};
use sqlx::{Error as SqlxError, SqlitePool};
use thiserror::Error;
use tokio::sync::{RwLock, oneshot};
use utils::{
    log_msg::LogMsg,
    msg_store::MsgStore,
    user_questions::{QuestionResponse, QuestionResponseStatus, UserQuestionRequest},
};
use uuid::Uuid;

#[derive(Debug)]
struct PendingQuestion {
    entry_index: usize,
    entry: NormalizedEntry,
    execution_process_id: Uuid,
    response_tx: oneshot::Sender<QuestionResponseStatus>,
}

type QuestionWaiter = Shared<BoxFuture<'static, QuestionResponseStatus>>;

#[derive(Debug)]
pub struct QuestionContext {
    pub execution_process_id: Uuid,
}

#[derive(Clone)]
pub struct UserQuestions {
    pending: Arc<DashMap<String, PendingQuestion>>,
    completed: Arc<DashMap<String, QuestionResponseStatus>>,
    msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
}

#[derive(Debug, Error)]
pub enum QuestionError {
    #[error("question request not found")]
    NotFound,
    #[error("question request already completed")]
    AlreadyCompleted,
    #[error("no executor session found for session_id: {0}")]
    NoExecutorSession(String),
    #[error("corresponding user question entry not found for question request")]
    NoQuestionEntry,
    #[error(transparent)]
    Custom(#[from] anyhow::Error),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
}

impl UserQuestions {
    pub fn new(msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>) -> Self {
        Self {
            pending: Arc::new(DashMap::new()),
            completed: Arc::new(DashMap::new()),
            msg_stores,
        }
    }

    pub async fn create_with_waiter(
        &self,
        request: UserQuestionRequest,
    ) -> Result<(UserQuestionRequest, QuestionWaiter), QuestionError> {
        let (tx, rx) = oneshot::channel();
        let waiter: QuestionWaiter = rx
            .map(|result| result.unwrap_or(QuestionResponseStatus::TimedOut))
            .boxed()
            .shared();
        let req_id = request.id.clone();

        if let Some(store) = self.msg_store_by_id(&request.execution_process_id).await {
            // Find the matching user question entry by question_id
            let matching_question = find_matching_question(store.clone(), &req_id);

            if let Some((idx, matching_question)) = matching_question {
                self.pending.insert(
                    req_id.clone(),
                    PendingQuestion {
                        entry_index: idx,
                        entry: matching_question,
                        execution_process_id: request.execution_process_id,
                        response_tx: tx,
                    },
                );
                tracing::debug!(
                    "Created question {} at entry index {}",
                    req_id,
                    idx
                );
            } else {
                tracing::warn!(
                    "No matching user question entry found for question request: question_id={}, execution_process_id={}",
                    req_id,
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

    #[tracing::instrument(skip(self, _pool, id, req))]
    pub async fn respond(
        &self,
        _pool: &SqlitePool,
        id: &str,
        req: QuestionResponse,
    ) -> Result<(QuestionResponseStatus, QuestionContext), QuestionError> {
        if let Some((_, p)) = self.pending.remove(id) {
            self.completed.insert(id.to_string(), req.status.clone());
            let _ = p.response_tx.send(req.status.clone());

            if let Some(store) = self.msg_store_by_id(&p.execution_process_id).await {
                let updated_entry = update_question_entry(&p.entry, req.status.clone())
                    .ok_or(QuestionError::NoQuestionEntry)?;

                store.push_patch(ConversationPatch::replace(p.entry_index, updated_entry));
            } else {
                tracing::warn!(
                    "No msg_store found for execution_process_id: {}",
                    p.execution_process_id
                );
            }

            let ctx = QuestionContext {
                execution_process_id: p.execution_process_id,
            };

            Ok((req.status, ctx))
        } else if self.completed.contains_key(id) {
            Err(QuestionError::AlreadyCompleted)
        } else {
            Err(QuestionError::NotFound)
        }
    }

    #[tracing::instrument(skip(self, id, timeout_at, waiter))]
    fn spawn_timeout_watcher(
        &self,
        id: String,
        timeout_at: chrono::DateTime<chrono::Utc>,
        waiter: QuestionWaiter,
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

                resolved = waiter.clone() => resolved,
                _ = tokio::time::sleep_until(deadline) => QuestionResponseStatus::TimedOut,
            };

            let is_timeout = matches!(&status, QuestionResponseStatus::TimedOut);
            completed.insert(id.clone(), status.clone());

            if is_timeout && let Some((_, pending_question)) = pending.remove(&id) {
                if pending_question.response_tx.send(status.clone()).is_err() {
                    tracing::debug!("question '{}' timeout notification receiver dropped", id);
                }

                let store = {
                    let map = msg_stores.read().await;
                    map.get(&pending_question.execution_process_id).cloned()
                };

                if let Some(store) = store {
                    if let Some(updated_entry) =
                        update_question_entry(&pending_question.entry, QuestionResponseStatus::TimedOut)
                    {
                        store.push_patch(ConversationPatch::replace(
                            pending_question.entry_index,
                            updated_entry,
                        ));
                    } else {
                        tracing::warn!(
                            "Timed out question '{}' but couldn't update status (no user-question entry).",
                            id
                        );
                    }
                } else {
                    tracing::warn!(
                        "No msg_store found for execution_process_id: {}",
                        pending_question.execution_process_id
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

/// Find a matching user question entry by question_id
fn find_matching_question(
    store: Arc<MsgStore>,
    question_id: &str,
) -> Option<(usize, NormalizedEntry)> {
    let history = store.get_history();

    for msg in history.iter().rev() {
        if let LogMsg::JsonPatch(patch) = msg
            && let Some((idx, entry)) = extract_normalized_entry_from_patch(patch)
            && let NormalizedEntryType::UserQuestion { question_id: entry_id, .. } = &entry.entry_type
            && entry_id == question_id
        {
            tracing::debug!(
                "Matched user question entry at index {idx} for question id '{question_id}'"
            );
            return Some((idx, entry));
        }
    }

    None
}

/// Convert QuestionResponseStatus to QuestionStatus
fn to_question_status(status: QuestionResponseStatus) -> QuestionStatus {
    match status {
        QuestionResponseStatus::Pending => QuestionStatus::Pending,
        QuestionResponseStatus::Answered {
            selected_options,
            other_text,
        } => QuestionStatus::Answered {
            selected_options,
            other_text,
        },
        QuestionResponseStatus::TimedOut => QuestionStatus::TimedOut,
    }
}

/// Update a user question entry with a new status
fn update_question_entry(
    entry: &NormalizedEntry,
    status: QuestionResponseStatus,
) -> Option<NormalizedEntry> {
    if let NormalizedEntryType::UserQuestion {
        question_id,
        question,
        options,
        allow_multiple,
        allow_other,
        ..
    } = &entry.entry_type
    {
        Some(NormalizedEntry {
            entry_type: NormalizedEntryType::UserQuestion {
                question_id: question_id.clone(),
                question: question.clone(),
                options: options.clone(),
                allow_multiple: *allow_multiple,
                allow_other: *allow_other,
                status: to_question_status(status),
            },
            ..entry.clone()
        })
    } else {
        None
    }
}
