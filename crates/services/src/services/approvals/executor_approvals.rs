use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use db::{self, DBService, models::execution_process::ExecutionProcess};
use executors::approvals::{ExecutorApprovalError, ExecutorApprovalService};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use utils::approvals::{ApprovalOutcome, ApprovalRequest, ApprovalStatus, QuestionStatus};
use uuid::Uuid;

use crate::services::{approvals::Approvals, notification::NotificationService};

type ApprovalWaiter = futures::future::Shared<futures::future::BoxFuture<'static, ApprovalOutcome>>;

pub struct ExecutorApprovalBridge {
    approvals: Approvals,
    db: DBService,
    notification_service: NotificationService,
    execution_process_id: Uuid,
    /// Waiters stored between create and wait phases, keyed by approval_id.
    waiters: Mutex<HashMap<String, ApprovalWaiter>>,
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
            waiters: Mutex::new(HashMap::new()),
        })
    }

    async fn create_internal(
        &self,
        tool_name: &str,
        is_question: bool,
        question_count: Option<usize>,
    ) -> Result<String, ExecutorApprovalError> {
        let request = ApprovalRequest::new(tool_name.to_string(), self.execution_process_id);

        let (request, waiter) = self
            .approvals
            .create_with_waiter(request, is_question)
            .await
            .map_err(ExecutorApprovalError::request_failed)?;

        let approval_id = request.id.clone();

        // Store waiter for the wait phase
        self.waiters
            .lock()
            .await
            .insert(approval_id.clone(), waiter);

        let workspace_name =
            ExecutionProcess::load_context(&self.db.pool, self.execution_process_id)
                .await
                .map(|ctx| {
                    ctx.workspace
                        .name
                        .unwrap_or_else(|| ctx.workspace.branch.clone())
                })
                .unwrap_or_else(|_| "Unknown workspace".to_string());

        let (title, message) = if let Some(count) = question_count {
            if count == 1 {
                (
                    format!("Question Asked: {}", workspace_name),
                    "1 question requires an answer".to_string(),
                )
            } else {
                (
                    format!("Question Asked: {}", workspace_name),
                    format!("{} questions require answers", count),
                )
            }
        } else {
            (
                format!("Approval Needed: {}", workspace_name),
                format!("Tool '{}' requires approval", tool_name),
            )
        };

        self.notification_service.notify(&title, &message).await;

        Ok(approval_id)
    }

    async fn wait_internal(
        &self,
        approval_id: &str,
        cancel: CancellationToken,
    ) -> Result<ApprovalOutcome, ExecutorApprovalError> {
        let waiter = self
            .waiters
            .lock()
            .await
            .remove(approval_id)
            .ok_or_else(|| {
                ExecutorApprovalError::request_failed(format!(
                    "no waiter found for approval_id={}",
                    approval_id
                ))
            })?;

        let outcome = tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Approval request cancelled for approval_id={}", approval_id);
                self.approvals.cancel(approval_id).await;
                return Err(ExecutorApprovalError::Cancelled);
            }
            outcome = waiter => outcome,
        };

        Ok(outcome)
    }
}

#[async_trait]
impl ExecutorApprovalService for ExecutorApprovalBridge {
    async fn create_tool_approval(&self, tool_name: &str) -> Result<String, ExecutorApprovalError> {
        self.create_internal(tool_name, false, None).await
    }

    async fn create_question_approval(
        &self,
        tool_name: &str,
        question_count: usize,
    ) -> Result<String, ExecutorApprovalError> {
        self.create_internal(tool_name, true, Some(question_count))
            .await
    }

    async fn wait_tool_approval(
        &self,
        approval_id: &str,
        cancel: CancellationToken,
    ) -> Result<ApprovalStatus, ExecutorApprovalError> {
        let outcome = self.wait_internal(approval_id, cancel).await?;

        match outcome {
            ApprovalOutcome::Approved => Ok(ApprovalStatus::Approved),
            ApprovalOutcome::Denied { reason } => Ok(ApprovalStatus::Denied { reason }),
            ApprovalOutcome::TimedOut => Ok(ApprovalStatus::TimedOut),
            ApprovalOutcome::Answered { .. } => Err(ExecutorApprovalError::request_failed(
                "unexpected question response for permission request",
            )),
        }
    }

    async fn wait_question_answer(
        &self,
        approval_id: &str,
        cancel: CancellationToken,
    ) -> Result<QuestionStatus, ExecutorApprovalError> {
        let outcome = self.wait_internal(approval_id, cancel).await?;

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
