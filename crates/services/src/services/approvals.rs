use std::{collections::HashMap, sync::Arc, time::Duration as StdDuration};

use dashmap::DashMap;
use db::models::executor_session::ExecutorSession;
use executors::logs::utils::{entry_index::EntryIndexProvider, patch::ConversationPatch};
use sqlx::{Error as SqlxError, SqlitePool};
use thiserror::Error;
use tokio::sync::{RwLock, oneshot};
use utils::{
    approvals::{ApprovalRequest, ApprovalResponseRequest, ApprovalStatus},
    msg_store::MsgStore,
};
use uuid::Uuid;

#[derive(Debug)]
struct PendingApproval {
    request: ApprovalRequest,
    response_tx: oneshot::Sender<ApprovalStatus>,
}

#[derive(Clone)]
pub struct Approvals {
    pending: Arc<DashMap<String, PendingApproval>>,
    completed: Arc<DashMap<String, ApprovalStatus>>,
    db_pool: SqlitePool,
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
    #[error(transparent)]
    Storage(#[from] anyhow::Error),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
}

impl Approvals {
    pub fn new(db_pool: SqlitePool, msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>) -> Self {
        Self {
            pending: Arc::new(DashMap::new()),
            completed: Arc::new(DashMap::new()),
            db_pool,
            msg_stores,
        }
    }

    pub async fn create(&self, request: ApprovalRequest) -> Result<ApprovalRequest, ApprovalError> {
        let execution_process_id = if let Some(executor_session) =
            ExecutorSession::find_by_session_id(&self.db_pool, &request.session_id).await?
        {
            executor_session.execution_process_id
        } else {
            tracing::warn!(
                "No executor session found for session_id: {}",
                request.session_id
            );
            return Err(ApprovalError::NoExecutorSession(request.session_id.clone()));
        };

        let (tx, rx) = oneshot::channel();
        let req_id = request.id.clone();
        self.pending.insert(
            req_id.clone(),
            PendingApproval {
                request: request.clone(),
                response_tx: tx,
            },
        );

        self.spawn_timeout_watcher(req_id.clone(), request.timeout_at, rx);

        if let Some(store) = self.msg_store_by_id(&execution_process_id).await {
            let idx = EntryIndexProvider::start_from(&store).next();
            let patch = ConversationPatch::add_approval_request(idx, request.clone());
            store.push_patch(patch);
        } else {
            tracing::warn!(
                "No msg_store found for execution_process_id: {}",
                execution_process_id
            );
        }

        Ok(request)
    }

    pub async fn respond(
        &self,
        id: &str,
        req: ApprovalResponseRequest,
    ) -> Result<(), ApprovalError> {
        if let Some((_, p)) = self.pending.remove(id) {
            self.completed.insert(id.to_string(), req.status.clone());
            let _ = p.response_tx.send(req.status.clone());

            if let Some(store) = self.msg_store_by_id(&req.execution_process_id).await {
                let idx = EntryIndexProvider::start_from(&store).next();
                let patch = ConversationPatch::add_approval_response(
                    idx,
                    utils::approvals::ApprovalResponse {
                        id: id.to_string(),
                        status: req.status,
                    },
                );
                store.push_patch(patch);
            } else {
                tracing::warn!(
                    "No msg_store found for execution_process_id: {}",
                    req.execution_process_id
                );
            }
            Ok(())
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
            if chrono::Utc::now() >= p.request.timeout_at {
                return Some(ApprovalStatus::TimedOut);
            }
            return Some(ApprovalStatus::Pending);
        }
        None
    }

    pub async fn pending(&self) -> Vec<ApprovalRequest> {
        self.pending
            .iter()
            .map(|e| e.value().request.clone())
            .collect()
    }

    fn spawn_timeout_watcher(
        &self,
        id: String,
        timeout_at: chrono::DateTime<chrono::Utc>,
        mut rx: oneshot::Receiver<ApprovalStatus>,
    ) {
        let pending = self.pending.clone();
        let completed = self.completed.clone();

        let now = chrono::Utc::now();
        let to_wait = (timeout_at - now)
            .to_std()
            .unwrap_or_else(|_| StdDuration::from_secs(0));
        let deadline = tokio::time::Instant::now() + to_wait;

        tokio::spawn(async move {
            tokio::select! {
                biased;

                r = &mut rx => {
                    match r {
                        Ok(status) => { completed.insert(id.clone(), status); }
                        Err(_canceled) => {
                            // The responder dropped; consider this a timeout
                            completed.insert(id.clone(), ApprovalStatus::TimedOut);
                        }
                    }
                }
                _ = tokio::time::sleep_until(deadline) => {
                    completed.insert(id.clone(), ApprovalStatus::TimedOut);
                }
            }

            pending.remove(&id);
        });
    }

    async fn msg_store_by_id(&self, execution_process_id: &Uuid) -> Option<Arc<MsgStore>> {
        let map = self.msg_stores.read().await;
        map.get(execution_process_id).cloned()
    }
}
