use std::sync::Arc;

use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;
use ts_rs::TS;
use utils::msg_store::MsgStore;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ApprovalRequest {
    pub id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub session_id: String,
    pub created_at: DateTime<Utc>,
    pub timeout_at: DateTime<Utc>,
}

impl ApprovalRequest {
    pub fn from_create(request: CreateApprovalRequest) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            tool_name: request.tool_name,
            tool_input: request.tool_input,
            session_id: request.session_id,
            created_at: now,
            timeout_at: now + Duration::seconds(120),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateApprovalRequest {
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Denied { reason: Option<String> },
    TimedOut,
}

pub struct PendingApproval {
    pub request: ApprovalRequest,
    pub response_tx: oneshot::Sender<ApprovalStatus>,
}

#[derive(Clone)]
pub struct Approvals {
    pending: Arc<DashMap<String, PendingApproval>>,
    completed: Arc<DashMap<String, ApprovalStatus>>,
    msg_store: Arc<MsgStore>,
}

impl Approvals {
    pub fn new(msg_store: Arc<MsgStore>) -> Self {
        Self {
            pending: Arc::new(DashMap::new()),
            completed: Arc::new(DashMap::new()),
            msg_store,
        }
    }

    pub async fn create_approval(&self, request: ApprovalRequest) -> Result<ApprovalRequest> {
        let approval_json = serde_json::to_value(&request)?;
        self.msg_store.push_approval_request(approval_json);

        let (tx, rx) = oneshot::channel();
        let pending_approval = PendingApproval {
            request: request.clone(),
            response_tx: tx,
        };
        self.pending.insert(request.id.clone(), pending_approval);

        let pending = self.pending.clone();
        let completed = self.completed.clone();
        let msg_store = self.msg_store.clone();
        let approval_id = request.id.clone();

        tokio::spawn(async move {
            match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
                Ok(Ok(status)) => {
                    completed.insert(approval_id.clone(), status.clone());
                    let response_json = serde_json::json!({
                        "id": approval_id,
                        "status": status
                    });
                    msg_store.push_approval_response(response_json);
                }
                _ => {
                    completed.insert(
                        approval_id.clone(),
                        ApprovalStatus::Denied {
                            reason: Some("User did not respond in time".to_string()),
                        },
                    );
                }
            }

            pending.remove(&approval_id);
        });

        Ok(request)
    }

    pub async fn get_status(&self, id: &str) -> Option<ApprovalStatus> {
        if let Some(entry) = self.completed.get(id) {
            return Some(entry.clone());
        }
        if self.pending.contains_key(id) {
            return Some(ApprovalStatus::Pending);
        }
        None
    }

    pub async fn respond_to_approval(&self, id: &str, response: ApprovalStatus) -> Result<()> {
        if let Some((_, pending)) = self.pending.remove(id) {
            self.completed.insert(id.to_string(), response.clone());
            let _ = pending.response_tx.send(response.clone());

            let response_json = serde_json::to_value(&response)?;
            self.msg_store.push_approval_response(response_json);
            Ok(())
        } else if self.completed.contains_key(id) {
            anyhow::bail!("Approval request already completed");
        } else {
            anyhow::bail!("Approval request not found");
        }
    }

    pub async fn get_pending(&self) -> Vec<ApprovalRequest> {
        self.pending
            .iter()
            .map(|entry| entry.value().request.clone())
            .collect()
    }
}
