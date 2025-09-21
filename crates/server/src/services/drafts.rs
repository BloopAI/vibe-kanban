use db::models::{
    draft::{Draft, DraftType, UpsertDraft},
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    image::TaskImage,
    task_attempt::TaskAttempt,
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType, coding_agent_follow_up::CodingAgentFollowUpRequest,
    },
    profile::ExecutorProfileId,
};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use ts_rs::TS;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    error::ApiError,
    routes::task_attempts::util::{
        ensure_worktree_path, handle_images_for_prompt, latest_executor_profile_for_attempt,
        require_latest_session_id,
    },
};

#[derive(Debug, Serialize, TS)]
pub struct DraftResponse {
    pub task_attempt_id: Uuid,
    pub draft_type: DraftType,
    pub retry_process_id: Option<Uuid>,
    pub prompt: String,
    pub queued: bool,
    pub variant: Option<String>,
    pub image_ids: Option<Vec<Uuid>>,
    pub version: i64,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateFollowUpDraftRequest {
    pub prompt: Option<String>,
    pub variant: Option<Option<String>>,
    pub image_ids: Option<Vec<Uuid>>,
    pub version: Option<i64>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateRetryFollowUpDraftRequest {
    pub retry_process_id: Uuid,
    pub prompt: Option<String>,
    pub variant: Option<Option<String>>,
    pub image_ids: Option<Vec<Uuid>>,
    pub version: Option<i64>,
}

#[derive(Debug, Deserialize, TS)]
pub struct SetQueueRequest {
    pub queued: bool,
    pub expected_queued: Option<bool>,
    pub expected_version: Option<i64>,
}

pub struct DraftsService<'a> {
    deployment: &'a DeploymentImpl,
}

impl<'a> DraftsService<'a> {
    pub fn new(deployment: &'a DeploymentImpl) -> Self {
        Self { deployment }
    }

    fn pool(&self) -> &sqlx::SqlitePool {
        &self.deployment.db().pool
    }

    fn draft_to_response(d: Draft) -> DraftResponse {
        DraftResponse {
            task_attempt_id: d.task_attempt_id,
            draft_type: d.draft_type,
            retry_process_id: d.retry_process_id,
            prompt: d.prompt,
            queued: d.queued,
            variant: d.variant,
            image_ids: d.image_ids,
            version: d.version,
        }
    }

    async fn ensure_follow_up_draft_row(&self, attempt_id: Uuid) -> Result<Draft, ApiError> {
        if let Some(d) =
            Draft::find_by_task_attempt_and_type(self.pool(), attempt_id, DraftType::FollowUp)
                .await?
        {
            return Ok(d);
        }

        let _ = Draft::upsert(
            self.pool(),
            &UpsertDraft {
                task_attempt_id: attempt_id,
                draft_type: DraftType::FollowUp,
                retry_process_id: None,
                prompt: "".to_string(),
                queued: false,
                variant: None,
                image_ids: None,
            },
        )
        .await?;

        Draft::find_by_task_attempt_and_type(self.pool(), attempt_id, DraftType::FollowUp)
            .await?
            .ok_or(SqlxError::RowNotFound.into())
    }

    async fn associate_images_for_task_if_any(
        &self,
        task_id: Uuid,
        image_ids: &Option<Vec<Uuid>>,
    ) -> Result<(), ApiError> {
        if let Some(ids) = image_ids
            && !ids.is_empty()
        {
            TaskImage::associate_many_dedup(self.pool(), task_id, ids).await?;
        }
        Ok(())
    }

    async fn has_running_processes_for_attempt(&self, attempt_id: Uuid) -> Result<bool, ApiError> {
        let processes =
            ExecutionProcess::find_by_task_attempt_id(self.pool(), attempt_id, false).await?;
        Ok(processes.into_iter().any(|p| {
            matches!(
                p.status,
                db::models::execution_process::ExecutionProcessStatus::Running
            )
        }))
    }

    async fn fetch_draft_response(
        &self,
        task_attempt_id: Uuid,
        draft_type: DraftType,
    ) -> Result<DraftResponse, ApiError> {
        let d =
            Draft::find_by_task_attempt_and_type(self.pool(), task_attempt_id, draft_type).await?;
        let resp = if let Some(d) = d {
            Self::draft_to_response(d)
        } else {
            DraftResponse {
                task_attempt_id,
                draft_type,
                retry_process_id: None,
                prompt: "".to_string(),
                queued: false,
                variant: None,
                image_ids: None,
                version: 0,
            }
        };
        Ok(resp)
    }

    async fn start_follow_up_from_draft(
        &self,
        task_attempt: &TaskAttempt,
        draft: &Draft,
    ) -> Result<ExecutionProcess, ApiError> {
        let _ = ensure_worktree_path(self.deployment, task_attempt).await?;
        let session_id =
            require_latest_session_id(&self.deployment.db().pool, task_attempt.id).await?;

        let base_profile =
            latest_executor_profile_for_attempt(&self.deployment.db().pool, task_attempt.id)
                .await?;
        let executor_profile_id = ExecutorProfileId {
            executor: base_profile.executor,
            variant: draft.variant.clone(),
        };

        let task = task_attempt
            .parent_task(&self.deployment.db().pool)
            .await?
            .ok_or(SqlxError::RowNotFound)?;
        let project = task
            .parent_project(&self.deployment.db().pool)
            .await?
            .ok_or(SqlxError::RowNotFound)?;

        let cleanup_action = self
            .deployment
            .container()
            .cleanup_action(project.cleanup_script);

        let mut prompt = draft.prompt.clone();
        if let Some(image_ids) = &draft.image_ids {
            prompt = handle_images_for_prompt(
                self.deployment,
                task_attempt,
                task_attempt.task_id,
                image_ids,
                &prompt,
            )
            .await?;
        }

        let follow_up_request = CodingAgentFollowUpRequest {
            prompt,
            session_id,
            executor_profile_id,
        };

        let follow_up_action = ExecutorAction::new(
            ExecutorActionType::CodingAgentFollowUpRequest(follow_up_request),
            cleanup_action,
        );

        let execution_process = self
            .deployment
            .container()
            .start_execution(
                task_attempt,
                &follow_up_action,
                &ExecutionProcessRunReason::CodingAgent,
            )
            .await?;

        let _ = Draft::clear_after_send(
            &self.deployment.db().pool,
            task_attempt.id,
            DraftType::FollowUp,
        )
        .await;

        Ok(execution_process)
    }

    pub async fn save_follow_up_draft(
        &self,
        task_attempt: &TaskAttempt,
        payload: &UpdateFollowUpDraftRequest,
    ) -> Result<DraftResponse, ApiError> {
        let pool = self.pool();
        let d = self.ensure_follow_up_draft_row(task_attempt.id).await?;
        if d.queued {
            return Err(ApiError::Conflict(
                "Draft is queued; click Edit to unqueue before editing".to_string(),
            ));
        }

        if let Some(expected_version) = payload.version
            && d.version != expected_version
        {
            return Err(ApiError::Conflict(
                "Draft changed, please retry with latest".to_string(),
            ));
        }

        if payload.prompt.is_none() && payload.variant.is_none() && payload.image_ids.is_none() {
        } else {
            Draft::update_partial(
                pool,
                task_attempt.id,
                DraftType::FollowUp,
                payload.prompt.clone(),
                payload.variant.clone(),
                payload.image_ids.clone(),
                None,
            )
            .await?;
        }

        if let Some(task) = task_attempt.parent_task(pool).await? {
            self.associate_images_for_task_if_any(task.id, &payload.image_ids)
                .await?;
        }

        let current =
            Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::FollowUp)
                .await?
                .map(Self::draft_to_response)
                .unwrap_or(DraftResponse {
                    task_attempt_id: task_attempt.id,
                    draft_type: DraftType::FollowUp,
                    retry_process_id: None,
                    prompt: "".to_string(),
                    queued: false,
                    variant: None,
                    image_ids: None,
                    version: 0,
                });

        Ok(current)
    }

    pub async fn save_retry_follow_up_draft(
        &self,
        task_attempt: &TaskAttempt,
        payload: &UpdateRetryFollowUpDraftRequest,
    ) -> Result<DraftResponse, ApiError> {
        let pool = self.pool();
        let existing =
            Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::Retry).await?;

        if let Some(d) = &existing {
            if d.queued {
                return Err(ApiError::Conflict(
                    "Retry draft is queued; unqueue before editing".to_string(),
                ));
            }
            if let Some(expected_version) = payload.version
                && d.version != expected_version
            {
                return Err(ApiError::Conflict(
                    "Retry draft changed, please retry with latest".to_string(),
                ));
            }
        }

        if existing.is_none() {
            let draft = Draft::upsert(
                pool,
                &UpsertDraft {
                    task_attempt_id: task_attempt.id,
                    draft_type: DraftType::Retry,
                    retry_process_id: Some(payload.retry_process_id),
                    prompt: payload.prompt.clone().unwrap_or_default(),
                    queued: false,
                    variant: payload.variant.clone().unwrap_or(None),
                    image_ids: payload.image_ids.clone(),
                },
            )
            .await?;

            return Ok(Self::draft_to_response(draft));
        }

        if payload.prompt.is_none() && payload.variant.is_none() && payload.image_ids.is_none() {
        } else {
            Draft::update_partial(
                pool,
                task_attempt.id,
                DraftType::Retry,
                payload.prompt.clone(),
                payload.variant.clone(),
                payload.image_ids.clone(),
                Some(payload.retry_process_id),
            )
            .await?;
        }

        if let Some(task) = task_attempt.parent_task(pool).await? {
            self.associate_images_for_task_if_any(task.id, &payload.image_ids)
                .await?;
        }

        let draft = Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::Retry)
            .await?
            .ok_or(SqlxError::RowNotFound)?;
        Ok(Self::draft_to_response(draft))
    }

    pub async fn delete_retry_follow_up_draft(
        &self,
        task_attempt: &TaskAttempt,
    ) -> Result<(), ApiError> {
        Draft::delete_by_task_attempt_and_type(self.pool(), task_attempt.id, DraftType::Retry)
            .await?;

        self.deployment
            .events()
            .emit_deleted_retry_draft_for_attempt(task_attempt.id);

        Ok(())
    }

    pub async fn set_follow_up_queue(
        &self,
        task_attempt: &TaskAttempt,
        payload: &SetQueueRequest,
    ) -> Result<DraftResponse, ApiError> {
        let pool = self.pool();

        let rows_updated = Draft::set_queued(
            pool,
            task_attempt.id,
            DraftType::FollowUp,
            payload.queued,
            payload.expected_queued,
            payload.expected_version,
        )
        .await?;

        let draft =
            Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::FollowUp)
                .await?;

        if rows_updated == 0 {
            if draft.is_none() {
                return Err(ApiError::Conflict("No draft to queue".to_string()));
            };

            return Err(ApiError::Conflict(
                "Draft changed, please refresh and try again".to_string(),
            ));
        }

        let should_consider_start = draft.as_ref().map(|c| c.queued).unwrap_or(false)
            && !self
                .has_running_processes_for_attempt(task_attempt.id)
                .await?;

        if should_consider_start
            && Draft::try_mark_sending(pool, task_attempt.id, DraftType::FollowUp)
                .await
                .unwrap_or(false)
        {
            let _ = self
                .start_follow_up_from_draft(task_attempt, draft.as_ref().unwrap())
                .await;
        }

        let draft =
            Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::FollowUp)
                .await?
                .ok_or(SqlxError::RowNotFound)?;

        Ok(Self::draft_to_response(draft))
    }

    pub async fn get_draft(
        &self,
        task_attempt_id: Uuid,
        draft_type: DraftType,
    ) -> Result<DraftResponse, ApiError> {
        self.fetch_draft_response(task_attempt_id, draft_type).await
    }
}
