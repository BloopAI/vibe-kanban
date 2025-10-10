use std::sync::Arc;

use async_trait::async_trait;
use db::{
    DBService,
    models::{
        execution_process::ExecutionProcess,
        executor_session::ExecutorSession,
        task::{Task, TaskStatus},
    },
};
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

    async fn ensure_task_in_review(&self) {
        if let Ok(ctx) =
            ExecutionProcess::load_context(&self.db.pool, self.execution_process_id).await
        {
            if ctx.task.status == TaskStatus::InProgress {
                if let Err(e) =
                    Task::update_status(&self.db.pool, ctx.task.id, TaskStatus::InReview).await
                {
                    tracing::warn!(
                        "Failed to update task status to InReview for approval request: {}",
                        e
                    );
                }
            }
        }
    }
}

#[async_trait]
impl ExecutorApprovalService for ExecutorApprovalBridge {
    async fn register_session(&self, session_id: &str) -> Result<(), ExecutorApprovalError> {
        {
            let mut guard = self.session_id.write().await;
            guard.replace(session_id.to_string());
        }

        ExecutorSession::update_session_id(&self.db.pool, self.execution_process_id, session_id)
            .await
            .map_err(|err| ExecutorApprovalError::request_failed(err))?;

        Ok(())
    }

    async fn request_tool_approval(
        &self,
        tool_name: &str,
        tool_input: Value,
    ) -> Result<ApprovalStatus, ExecutorApprovalError> {
        let session_id = {
            let guard = self.session_id.read().await;
            guard
                .clone()
                .ok_or(ExecutorApprovalError::SessionNotRegistered)?
        };

        self.ensure_task_in_review().await;

        let request = ApprovalRequest::from_create(
            CreateApprovalRequest {
                tool_name: tool_name.to_string(),
                tool_input,
                session_id,
            },
            self.execution_process_id,
        );

        let (_, waiter) = self
            .approvals
            .create_with_waiter(request)
            .await
            .map_err(|err| ExecutorApprovalError::request_failed(err))?;

        let status = waiter.clone().await;

        if matches!(status, ApprovalStatus::Pending) {
            return Err(ExecutorApprovalError::request_failed(
                "approval finished in pending state",
            ));
        }

        Ok(status)
    }
}
