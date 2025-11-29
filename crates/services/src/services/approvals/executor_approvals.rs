use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use db::{self, DBService};
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

        let (_, waiter) = self
            .approvals
            .create_with_waiter(request)
            .await
            .map_err(ExecutorApprovalError::request_failed)?;

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

        let (_, waiter) = self
            .approvals
            .create_with_waiter(request)
            .await
            .map_err(ExecutorApprovalError::request_failed)?;

        let response_data = waiter.clone().await;

        if matches!(response_data.status, ApprovalStatus::Pending) {
            return Err(ExecutorApprovalError::request_failed(
                "question finished in pending state",
            ));
        }

        Ok((response_data.status, response_data.answers))
    }
}
