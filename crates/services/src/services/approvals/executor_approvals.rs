use std::sync::Arc;

use async_trait::async_trait;
use db::{self, DBService};
use executors::approvals::{ExecutorApprovalError, ExecutorApprovalService};
use serde_json::Value;
use tokio::sync::RwLock;
use utils::approvals::{ApprovalRequest, ApprovalStatus, CreateApprovalRequest};
use uuid::Uuid;

use crate::services::approvals::Approvals;

pub struct ExecutorApprovalBridge {
    approvals: Approvals,
    db: DBService,
    execution_process_id: Uuid,
    session_id: RwLock<Option<String>>,
}

impl ExecutorApprovalBridge {
    pub fn new(approvals: Approvals, db: DBService, execution_process_id: Uuid) -> Arc<Self> {
        Arc::new(Self {
            approvals,
            db,
            execution_process_id,
            session_id: RwLock::new(None),
        })
    }
}

#[async_trait]
impl ExecutorApprovalService for ExecutorApprovalBridge {
    async fn register_session(&self, session_id: &str) -> Result<(), ExecutorApprovalError> {
        let mut guard = self.session_id.write().await;
        guard.replace(session_id.to_string());

        Ok(())
    }

    async fn request_tool_approval(
        &self,
        tool_name: &str,
        tool_input: Value,
        tool_call_id: &str,
    ) -> Result<ApprovalStatus, ExecutorApprovalError> {
        let session_id = {
            let guard = self.session_id.read().await;
            guard
                .clone()
                .ok_or(ExecutorApprovalError::SessionNotRegistered)?
        };

        super::ensure_task_in_review(&self.db.pool, self.execution_process_id).await;

        let request = ApprovalRequest::from_create(
            CreateApprovalRequest {
                tool_name: tool_name.to_string(),
                tool_input,
                session_id,
                tool_call_id: Some(tool_call_id.to_string()),
            },
            self.execution_process_id,
        );

        let (_, waiter) = self
            .approvals
            .create_with_waiter(request)
            .await
            .map_err(ExecutorApprovalError::request_failed)?;

        let status = waiter.clone().await;

        if matches!(status, ApprovalStatus::Pending) {
            return Err(ExecutorApprovalError::request_failed(
                "approval finished in pending state",
            ));
        }

        Ok(status)
    }
}
