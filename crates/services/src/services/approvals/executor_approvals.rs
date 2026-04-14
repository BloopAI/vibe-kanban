use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use db::DBService;
use executors::approvals::{ExecutorApprovalError, ExecutorApprovalService};
use serde_json::Value;
use utils::approvals::{ApprovalRequest, ApprovalStatus, CreateApprovalRequest, Question};
use uuid::Uuid;

use crate::services::approvals::Approvals;

pub struct ExecutorApprovalBridge {
    approvals: Approvals,
    db: DBService,
    execution_process_id: Uuid,
}

impl ExecutorApprovalBridge {
    pub fn new(approvals: Approvals, db: DBService, execution_process_id: Uuid) -> Arc<Self> {
        Arc::new(Self {
            approvals,
            db,
            execution_process_id,
        })
    }
}

#[async_trait]
impl ExecutorApprovalService for ExecutorApprovalBridge {
    async fn request_tool_approval(
        &self,
        tool_name: &str,
        tool_input: Value,
        tool_call_id: &str,
    ) -> Result<ApprovalStatus, ExecutorApprovalError> {
        super::ensure_task_in_review(&self.db.pool, self.execution_process_id).await;

        let request = ApprovalRequest::from_create(
            CreateApprovalRequest {
                tool_name: tool_name.to_string(),
                tool_input,
                tool_call_id: tool_call_id.to_string(),
            },
            self.execution_process_id,
        );

        let (request_ref, waiter) = self
            .approvals
            .create_with_waiter(request)
            .await
            .map_err(ExecutorApprovalError::request_failed)?;

        // Fire webhook for approval_request (non-blocking)
        {
            use crate::services::webhook::{WebhookEventPayload, WebhookService};
            let pool = self.db.pool.clone();
            let exec_id = self.execution_process_id;
            let approval_id = request_ref.id.clone();
            let tool_name = request_ref.tool_name.clone();
            let tool_input = request_ref.tool_input.clone();
            let timeout_at = Some(request_ref.timeout_at);
            tokio::spawn(async move {
                let event = WebhookEventPayload::ApprovalRequest {
                    approval_id,
                    tool_name,
                    tool_input,
                    timeout_at,
                };
                if let Some(ctx) =
                    WebhookService::build_approval_context(&pool, exec_id, event).await
                {
                    let project_id = ctx.project_id;
                    WebhookService::fire(&pool, project_id, ctx).await;
                } else {
                    tracing::debug!(
                        exec_id = %exec_id,
                        "webhook: could not build approval context, event not delivered"
                    );
                }
            });
        }

        let response_data = waiter.clone().await;

        if matches!(response_data.status, ApprovalStatus::Pending) {
            return Err(ExecutorApprovalError::request_failed(
                "approval finished in pending state",
            ));
        }

        Ok(response_data.status)
    }

    async fn request_question_approval(
        &self,
        questions: &[Question],
        tool_call_id: &str,
    ) -> Result<(ApprovalStatus, Option<HashMap<String, String>>), ExecutorApprovalError> {
        super::ensure_task_in_review(&self.db.pool, self.execution_process_id).await;

        // Create an approval request with questions
        let request = ApprovalRequest::from_questions(
            questions.to_vec(),
            tool_call_id.to_string(),
            self.execution_process_id,
        );

        let (request_ref, waiter) = self
            .approvals
            .create_with_waiter(request)
            .await
            .map_err(ExecutorApprovalError::request_failed)?;

        // Fire webhook for pending_question (non-blocking)
        {
            use crate::services::webhook::{WebhookEventPayload, WebhookService};
            let pool = self.db.pool.clone();
            let exec_id = self.execution_process_id;
            let question_id = request_ref.id.clone();
            let questions_clone = request_ref.questions.clone().unwrap_or_default();
            let timeout_at = Some(request_ref.timeout_at);
            tokio::spawn(async move {
                let event = WebhookEventPayload::PendingQuestion {
                    question_id,
                    questions: questions_clone,
                    timeout_at,
                };
                if let Some(ctx) =
                    WebhookService::build_approval_context(&pool, exec_id, event).await
                {
                    let project_id = ctx.project_id;
                    WebhookService::fire(&pool, project_id, ctx).await;
                } else {
                    tracing::debug!(
                        exec_id = %exec_id,
                        "webhook: could not build question context, event not delivered"
                    );
                }
            });
        }

        let response_data = waiter.clone().await;

        if matches!(response_data.status, ApprovalStatus::Pending) {
            return Err(ExecutorApprovalError::request_failed(
                "question finished in pending state",
            ));
        }

        Ok((response_data.status, response_data.answers))
    }
}
