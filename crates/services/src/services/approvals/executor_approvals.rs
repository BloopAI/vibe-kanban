use std::sync::Arc;

use async_trait::async_trait;
use db::{self, DBService, models::execution_process::ExecutionProcess};
use executors::approvals::{ExecutorApprovalError, ExecutorApprovalService};
use serde_json::Value;
use tokio_util::sync::CancellationToken;
use utils::approvals::{
    ApprovalOutcome, ApprovalRequest, ApprovalStatus, CreateApprovalRequest, QuestionStatus,
};
use uuid::Uuid;

use crate::services::{approvals::Approvals, notification::NotificationService};

pub struct ExecutorApprovalBridge {
    approvals: Approvals,
    db: DBService,
    notification_service: NotificationService,
    execution_process_id: Uuid,
}

impl ExecutorApprovalBridge {
    pub fn new(
        approvals: Approvals,
        db: DBService,
        notification_service: NotificationService,
        execution_process_id: Uuid,
    ) -> Arc<Self> {
        Arc::new(Self {
            approvals,
            db,
            notification_service,
            execution_process_id,
        })
    }

    async fn request_internal(
        &self,
        tool_name: &str,
        tool_input: Value,
        tool_call_id: &str,
        is_question: bool,
        cancel: CancellationToken,
    ) -> Result<ApprovalOutcome, ExecutorApprovalError> {
        let request = ApprovalRequest::from_create(
            CreateApprovalRequest {
                tool_name: tool_name.to_string(),
                tool_input,
                tool_call_id: tool_call_id.to_string(),
            },
            self.execution_process_id,
        );

        let (request, waiter) = self
            .approvals
            .create_with_waiter(request, is_question)
            .await
            .map_err(ExecutorApprovalError::request_failed)?;

        let approval_id = request.id.clone();

        let workspace_name =
            ExecutionProcess::load_context(&self.db.pool, self.execution_process_id)
                .await
                .map(|ctx| {
                    ctx.workspace
                        .name
                        .unwrap_or_else(|| ctx.workspace.branch.clone())
                })
                .unwrap_or_else(|_| "Unknown workspace".to_string());

        self.notification_service
            .notify(
                &format!("Approval Needed: {}", workspace_name),
                &format!("Tool '{}' requires approval", tool_name),
            )
            .await;

        let outcome = tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Approval request cancelled for tool_call_id={}", tool_call_id);
                self.approvals.cancel(&approval_id).await;
                return Err(ExecutorApprovalError::Cancelled);
            }
            outcome = waiter.clone() => outcome,
        };

        Ok(outcome)
    }
}

#[async_trait]
impl ExecutorApprovalService for ExecutorApprovalBridge {
    async fn request_tool_approval(
        &self,
        tool_name: &str,
        tool_input: Value,
        tool_call_id: &str,
        cancel: CancellationToken,
    ) -> Result<ApprovalStatus, ExecutorApprovalError> {
        let outcome = self
            .request_internal(tool_name, tool_input, tool_call_id, false, cancel)
            .await?;

        match outcome {
            ApprovalOutcome::Approved => Ok(ApprovalStatus::Approved),
            ApprovalOutcome::Denied { reason } => Ok(ApprovalStatus::Denied { reason }),
            ApprovalOutcome::TimedOut => Ok(ApprovalStatus::TimedOut),
            ApprovalOutcome::Answered { .. } => Err(ExecutorApprovalError::request_failed(
                "unexpected question response for permission request",
            )),
        }
    }

    async fn request_question_answer(
        &self,
        tool_name: &str,
        tool_input: Value,
        tool_call_id: &str,
        cancel: CancellationToken,
    ) -> Result<QuestionStatus, ExecutorApprovalError> {
        let outcome = self
            .request_internal(tool_name, tool_input, tool_call_id, true, cancel)
            .await?;

        match outcome {
            ApprovalOutcome::Answered { answers } => Ok(QuestionStatus::Answered { answers }),
            ApprovalOutcome::TimedOut => Ok(QuestionStatus::TimedOut),
            ApprovalOutcome::Approved | ApprovalOutcome::Denied { .. } => {
                Err(ExecutorApprovalError::request_failed(
                    "unexpected permission response for question request",
                ))
            }
        }
    }
}
