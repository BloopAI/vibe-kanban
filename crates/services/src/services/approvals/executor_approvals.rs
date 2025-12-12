use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use db::{self, models::plan_step::{CreatePlanStep, PlanStep}, DBService};
use executors::approvals::{ExecutorApprovalError, ExecutorApprovalService};
use serde_json::Value;
use tracing::{debug, error, info, warn};
use utils::approvals::{ApprovalRequest, ApprovalStatus, CreateApprovalRequest, Question};
use uuid::Uuid;

use crate::services::{approvals::Approvals, plan_parser::PlanParser};

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

    async fn on_exit_plan_mode(
        &self,
        plan_text: &str,
        tool_call_id: &str,
    ) -> Result<(), ExecutorApprovalError> {
        let attempt_id = self.execution_process_id;

        debug!(
            attempt_id = %attempt_id,
            plan_length = plan_text.len(),
            tool_call_id = %tool_call_id,
            "Processing ExitPlanMode approval - parsing plan"
        );

        // Check for verbose debug mode
        if std::env::var("VIBE_DEBUG_PLAN_STEPS").is_ok() {
            debug!(plan_text = %plan_text, "Full plan text from ExitPlanMode");
        }

        // Parse plan into steps
        let parsed_steps = PlanParser::parse(plan_text);

        if parsed_steps.is_empty() {
            warn!(
                attempt_id = %attempt_id,
                "No steps parsed from plan text"
            );
            return Ok(());
        }

        info!(
            attempt_id = %attempt_id,
            parsed_count = parsed_steps.len(),
            "Parsed plan steps, creating in database"
        );

        // Create plan steps directly in database
        let mut created_count = 0;
        for step in parsed_steps {
            let create_req = CreatePlanStep {
                parent_attempt_id: attempt_id,
                sequence_order: step.sequence_order,
                title: step.title.clone(),
                description: step.description.clone(),
                status: None,
                child_task_id: None,
                auto_start: None,
            };

            match PlanStep::create(&self.db.pool, &create_req).await {
                Ok(created) => {
                    debug!(
                        step_id = %created.id,
                        title = %created.title,
                        "Created plan step"
                    );
                    created_count += 1;
                }
                Err(e) => {
                    error!(
                        attempt_id = %attempt_id,
                        step_title = %step.title,
                        error = %e,
                        "Failed to create plan step"
                    );
                    // Continue with remaining steps
                }
            }
        }

        info!(
            attempt_id = %attempt_id,
            created_count = created_count,
            "Finished creating plan steps from ExitPlanMode"
        );

        Ok(())
    }
}
