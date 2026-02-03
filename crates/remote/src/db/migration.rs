use chrono::{DateTime, Utc};
use sqlx::PgPool;
use thiserror::Error;
use api_types::{
    MigrateIssueRequest, MigrateProjectRequest, MigratePullRequestRequest, MigrateWorkspaceRequest,
};
use uuid::Uuid;

use super::{project_statuses::ProjectStatusRepository, tags::TagRepository};
use api_types::PullRequestStatus;

#[derive(Debug, Error)]
pub enum MigrationError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("project status error: {0}")]
    ProjectStatus(#[from] super::project_statuses::ProjectStatusError),
    #[error("tag error: {0}")]
    Tag(#[from] super::tags::TagError),
}

pub struct MigrationRepository;

impl MigrationRepository {
    pub async fn bulk_create_projects(
        pool: &PgPool,
        inputs: Vec<MigrateProjectRequest>,
    ) -> Result<Vec<Uuid>, MigrationError> {
        if inputs.is_empty() {
            return Ok(vec![]);
        }

        let mut tx = pool.begin().await?;

        let org_ids: Vec<Uuid> = inputs.iter().map(|i| i.organization_id).collect();
        let names: Vec<String> = inputs.iter().map(|i| i.name.clone()).collect();
        let colors: Vec<String> = inputs.iter().map(|i| i.color.clone()).collect();
        let created_ats: Vec<DateTime<Utc>> = inputs.iter().map(|i| i.created_at).collect();

        let ids = sqlx::query_scalar!(
            r#"
            INSERT INTO projects (id, organization_id, name, color, created_at, updated_at)
            SELECT gen_random_uuid(), organization_id, name, color, created_at, NOW()
            FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::timestamptz[])
                AS t(organization_id, name, color, created_at)
            RETURNING id
            "#,
            &org_ids,
            &names,
            &colors,
            &created_ats,
        )
        .fetch_all(&mut *tx)
        .await?;

        for id in &ids {
            TagRepository::create_default_tags(&mut *tx, *id).await?;
            ProjectStatusRepository::create_default_statuses(&mut *tx, *id).await?;
        }

        tx.commit().await?;

        Ok(ids)
    }

    pub async fn bulk_create_issues(
        pool: &PgPool,
        inputs: Vec<MigrateIssueRequest>,
    ) -> Result<Vec<Uuid>, MigrationError> {
        if inputs.is_empty() {
            return Ok(vec![]);
        }

        let project_ids: Vec<Uuid> = inputs.iter().map(|i| i.project_id).collect();
        let status_names: Vec<String> = inputs.iter().map(|i| i.status_name.clone()).collect();
        let titles: Vec<String> = inputs.iter().map(|i| i.title.clone()).collect();
        let descriptions: Vec<Option<String>> =
            inputs.iter().map(|i| i.description.clone()).collect();
        let created_ats: Vec<DateTime<Utc>> = inputs.iter().map(|i| i.created_at).collect();

        let ids = sqlx::query_scalar!(
            r#"
            INSERT INTO issues (id, project_id, status_id, title, description, priority, sort_order, extension_metadata, created_at)
            SELECT
                gen_random_uuid(),
                t.project_id,
                (SELECT id FROM project_statuses ps WHERE ps.project_id = t.project_id AND LOWER(ps.name) = LOWER(t.status_name)),
                t.title,
                t.description,
                NULL,
                0.0,
                '{}'::jsonb,
                t.created_at
            FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])
                AS t(project_id, status_name, title, description, created_at)
            RETURNING id
            "#,
            &project_ids,
            &status_names,
            &titles,
            &descriptions as &[Option<String>],
            &created_ats
        )
        .fetch_all(pool)
        .await?;

        Ok(ids)
    }

    pub async fn bulk_create_pull_requests(
        pool: &PgPool,
        inputs: Vec<MigratePullRequestRequest>,
    ) -> Result<Vec<Uuid>, MigrationError> {
        if inputs.is_empty() {
            return Ok(vec![]);
        }

        let urls: Vec<String> = inputs.iter().map(|i| i.url.clone()).collect();
        let numbers: Vec<i32> = inputs.iter().map(|i| i.number).collect();
        let statuses: Vec<PullRequestStatus> =
            inputs.iter().map(|i| parse_pr_status(&i.status)).collect();
        let merged_ats: Vec<Option<DateTime<Utc>>> = inputs.iter().map(|i| i.merged_at).collect();
        let merge_commit_shas: Vec<Option<String>> =
            inputs.iter().map(|i| i.merge_commit_sha.clone()).collect();
        let target_branch_names: Vec<String> = inputs
            .iter()
            .map(|i| i.target_branch_name.clone())
            .collect();
        let issue_ids: Vec<Uuid> = inputs.iter().map(|i| i.issue_id).collect();

        let ids = sqlx::query_scalar!(
            r#"
            INSERT INTO pull_requests (id, url, number, status, merged_at, merge_commit_sha, target_branch_name, issue_id)
            SELECT gen_random_uuid(), url, number, status, merged_at, merge_commit_sha, target_branch_name, issue_id
            FROM UNNEST($1::text[], $2::int[], $3::pull_request_status[], $4::timestamptz[], $5::text[], $6::text[], $7::uuid[])
                AS t(url, number, status, merged_at, merge_commit_sha, target_branch_name, issue_id)
            RETURNING id
            "#,
            &urls,
            &numbers,
            &statuses as &[PullRequestStatus],
            &merged_ats as &[Option<DateTime<Utc>>],
            &merge_commit_shas as &[Option<String>],
            &target_branch_names,
            &issue_ids
        )
        .fetch_all(pool)
        .await?;

        Ok(ids)
    }

    pub async fn bulk_create_workspaces(
        pool: &PgPool,
        owner_user_id: Uuid,
        inputs: Vec<MigrateWorkspaceRequest>,
    ) -> Result<Vec<Uuid>, MigrationError> {
        if inputs.is_empty() {
            return Ok(vec![]);
        }

        let project_ids: Vec<Uuid> = inputs.iter().map(|i| i.project_id).collect();
        let issue_ids: Vec<Option<Uuid>> = inputs.iter().map(|i| i.issue_id).collect();
        let local_workspace_ids: Vec<Uuid> = inputs.iter().map(|i| i.local_workspace_id).collect();
        let archived_values: Vec<bool> = inputs.iter().map(|i| i.archived).collect();
        let created_ats: Vec<DateTime<Utc>> = inputs.iter().map(|i| i.created_at).collect();
        let owner_ids: Vec<Uuid> = vec![owner_user_id; inputs.len()];

        let ids = sqlx::query_scalar!(
            r#"
            INSERT INTO workspaces (project_id, owner_user_id, issue_id, local_workspace_id, archived, created_at)
            SELECT project_id, owner_user_id, issue_id, local_workspace_id, archived, created_at
            FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::boolean[], $6::timestamptz[])
                AS t(project_id, owner_user_id, issue_id, local_workspace_id, archived, created_at)
            RETURNING id
            "#,
            &project_ids,
            &owner_ids,
            &issue_ids as &[Option<Uuid>],
            &local_workspace_ids,
            &archived_values,
            &created_ats,
        )
        .fetch_all(pool)
        .await?;

        Ok(ids)
    }
}

fn parse_pr_status(s: &str) -> PullRequestStatus {
    match s.to_lowercase().as_str() {
        "merged" => PullRequestStatus::Merged,
        "closed" => PullRequestStatus::Closed,
        _ => PullRequestStatus::Open,
    }
}
