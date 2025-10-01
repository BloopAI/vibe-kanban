use std::path::{Path, PathBuf};

use db::{
    DBService,
    models::{
        draft::{Draft, DraftType, UpsertDraft},
        execution_process::{ExecutionProcess, ExecutionProcessError, ExecutionProcessRunReason},
        image::TaskImage,
        task_attempt::TaskAttempt,
    },
};
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType, coding_agent_follow_up::CodingAgentFollowUpRequest,
    },
    profile::ExecutorProfileId,
};
use serde::{Deserialize, Serialize};
use sqlx::Error as SqlxError;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::{
    container::{ContainerError, ContainerService},
    image::{ImageError, ImageService},
};

#[derive(Debug, Error)]
pub enum DraftsServiceError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Container(#[from] ContainerError),
    #[error(transparent)]
    Image(#[from] ImageError),
    #[error(transparent)]
    ExecutionProcess(#[from] ExecutionProcessError),
    #[error("Conflict: {0}")]
    Conflict(String),
}

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

#[derive(Clone)]
pub struct DraftsService {
    db: DBService,
    image: ImageService,
}

impl DraftsService {
    pub fn new(db: DBService, image: ImageService) -> Self {
        Self { db, image }
    }

    fn pool(&self) -> &sqlx::SqlitePool {
        &self.db.pool
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

    async fn ensure_follow_up_draft_row(
        &self,
        attempt_id: Uuid,
    ) -> Result<Draft, DraftsServiceError> {
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
            .ok_or(SqlxError::RowNotFound)
            .map_err(DraftsServiceError::from)
    }

    async fn associate_images_for_task_if_any(
        &self,
        task_id: Uuid,
        image_ids: &Option<Vec<Uuid>>,
    ) -> Result<(), DraftsServiceError> {
        if let Some(ids) = image_ids
            && !ids.is_empty()
        {
            TaskImage::associate_many_dedup(self.pool(), task_id, ids).await?;
        }
        Ok(())
    }

    async fn has_running_processes_for_attempt(
        &self,
        attempt_id: Uuid,
    ) -> Result<bool, DraftsServiceError> {
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
    ) -> Result<DraftResponse, DraftsServiceError> {
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

    async fn handle_images_for_prompt(
        &self,
        task_id: Uuid,
        image_ids: &[Uuid],
        prompt: &str,
        worktree_path: &Path,
    ) -> Result<String, DraftsServiceError> {
        if image_ids.is_empty() {
            return Ok(prompt.to_string());
        }

        TaskImage::associate_many_dedup(self.pool(), task_id, image_ids).await?;
        self.image
            .copy_images_by_ids_to_worktree(worktree_path, image_ids)
            .await?;
        Ok(ImageService::canonicalise_image_paths(
            prompt,
            worktree_path,
        ))
    }

    async fn start_follow_up_from_draft(
        &self,
        container: &(dyn ContainerService + Send + Sync),
        task_attempt: &TaskAttempt,
        draft: &Draft,
    ) -> Result<ExecutionProcess, DraftsServiceError> {
        let worktree_ref = container.ensure_container_exists(task_attempt).await?;
        let worktree_path = PathBuf::from(worktree_ref);
        let base_profile =
            ExecutionProcess::latest_executor_profile_for_attempt(self.pool(), task_attempt.id)
                .await?;
        let executor_profile_id = ExecutorProfileId {
            executor: base_profile.executor,
            variant: draft.variant.clone(),
        };

        let task = task_attempt
            .parent_task(self.pool())
            .await?
            .ok_or(SqlxError::RowNotFound)
            .map_err(DraftsServiceError::from)?;
        let project = task
            .parent_project(self.pool())
            .await?
            .ok_or(SqlxError::RowNotFound)
            .map_err(DraftsServiceError::from)?;

        let cleanup_action = container.cleanup_action(project.cleanup_script);

        let mut prompt = draft.prompt.clone();
        if let Some(image_ids) = &draft.image_ids {
            prompt = self
                .handle_images_for_prompt(task_attempt.task_id, image_ids, &prompt, &worktree_path)
                .await?;
        }

        let latest_session_id =
            ExecutionProcess::find_latest_session_id_by_task_attempt(self.pool(), task_attempt.id)
                .await?;

        let action_type = if let Some(session_id) = latest_session_id {
            ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
                prompt: prompt.clone(),
                session_id,
                executor_profile_id,
            })
        } else {
            ExecutorActionType::CodingAgentInitialRequest(
                executors::actions::coding_agent_initial::CodingAgentInitialRequest {
                    prompt,
                    executor_profile_id,
                },
            )
        };

        let follow_up_action = ExecutorAction::new(action_type, cleanup_action);

        let execution_process = container
            .start_execution(
                task_attempt,
                &follow_up_action,
                &ExecutionProcessRunReason::CodingAgent,
            )
            .await?;

        let _ = Draft::clear_after_send(self.pool(), task_attempt.id, DraftType::FollowUp).await;

        Ok(execution_process)
    }

    pub async fn save_follow_up_draft(
        &self,
        task_attempt: &TaskAttempt,
        payload: &UpdateFollowUpDraftRequest,
    ) -> Result<DraftResponse, DraftsServiceError> {
        let pool = self.pool();
        let d = self.ensure_follow_up_draft_row(task_attempt.id).await?;
        if d.queued {
            return Err(DraftsServiceError::Conflict(
                "Draft is queued; click Edit to unqueue before editing".to_string(),
            ));
        }

        if let Some(expected_version) = payload.version
            && d.version != expected_version
        {
            return Err(DraftsServiceError::Conflict(
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
    ) -> Result<DraftResponse, DraftsServiceError> {
        let pool = self.pool();
        let existing =
            Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::Retry).await?;

        if let Some(d) = &existing {
            if d.queued {
                return Err(DraftsServiceError::Conflict(
                    "Retry draft is queued; unqueue before editing".to_string(),
                ));
            }
            if let Some(expected_version) = payload.version
                && d.version != expected_version
            {
                return Err(DraftsServiceError::Conflict(
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
            .ok_or(SqlxError::RowNotFound)
            .map_err(DraftsServiceError::from)?;
        Ok(Self::draft_to_response(draft))
    }

    pub async fn delete_retry_follow_up_draft(
        &self,
        task_attempt: &TaskAttempt,
    ) -> Result<(), DraftsServiceError> {
        Draft::delete_by_task_attempt_and_type(self.pool(), task_attempt.id, DraftType::Retry)
            .await?;

        Ok(())
    }

    pub async fn set_follow_up_queue(
        &self,
        container: &(dyn ContainerService + Send + Sync),
        task_attempt: &TaskAttempt,
        payload: &SetQueueRequest,
    ) -> Result<DraftResponse, DraftsServiceError> {
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
                return Err(DraftsServiceError::Conflict(
                    "No draft to queue".to_string(),
                ));
            };

            return Err(DraftsServiceError::Conflict(
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
                .start_follow_up_from_draft(container, task_attempt, draft.as_ref().unwrap())
                .await;
        }

        let draft =
            Draft::find_by_task_attempt_and_type(pool, task_attempt.id, DraftType::FollowUp)
                .await?
                .ok_or(SqlxError::RowNotFound)
                .map_err(DraftsServiceError::from)?;

        Ok(Self::draft_to_response(draft))
    }

    pub async fn get_draft(
        &self,
        task_attempt_id: Uuid,
        draft_type: DraftType,
    ) -> Result<DraftResponse, DraftsServiceError> {
        self.fetch_draft_response(task_attempt_id, draft_type).await
    }
}
