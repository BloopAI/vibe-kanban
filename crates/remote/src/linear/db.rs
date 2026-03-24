use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LinearProjectConnection {
    pub id: Uuid,
    pub project_id: Uuid,
    pub linear_team_id: String,
    pub linear_project_id: Option<String>,
    pub encrypted_api_key: String,
    pub linear_webhook_id: Option<String>,
    pub linear_webhook_secret: Option<String>,
    pub sync_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct LinearIssueLink {
    pub id: Uuid,
    pub vk_issue_id: Uuid,
    pub linear_issue_id: String,
    pub linear_issue_identifier: String,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub gitnexus_analyzed: bool,
    pub linear_ignored: bool,
    pub worktree_branch: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct LinearStatusMapping {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub vk_status_id: Uuid,
    pub linear_state_id: String,
    pub linear_state_name: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LinearLabelLink {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub vk_tag_id: Uuid,
    pub linear_label_id: String,
    pub linear_label_name: String,
}

pub struct CreateConnectionInput {
    pub project_id: Uuid,
    pub linear_team_id: String,
    pub linear_project_id: Option<String>,
    pub encrypted_api_key: String,
}

// ── Connections ───────────────────────────────────────────────────────────────

pub async fn get_connection_for_project(
    pool: &PgPool,
    project_id: Uuid,
) -> sqlx::Result<Option<LinearProjectConnection>> {
    sqlx::query_as!(
        LinearProjectConnection,
        r#"
        SELECT id, project_id, linear_team_id, linear_project_id,
               encrypted_api_key, linear_webhook_id, linear_webhook_secret,
               sync_enabled, created_at, updated_at
        FROM linear_project_connections
        WHERE project_id = $1 AND sync_enabled = TRUE
        "#,
        project_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn get_connection_by_id(
    pool: &PgPool,
    id: Uuid,
) -> sqlx::Result<Option<LinearProjectConnection>> {
    sqlx::query_as!(
        LinearProjectConnection,
        r#"
        SELECT id, project_id, linear_team_id, linear_project_id,
               encrypted_api_key, linear_webhook_id, linear_webhook_secret,
               sync_enabled, created_at, updated_at
        FROM linear_project_connections
        WHERE id = $1
        "#,
        id
    )
    .fetch_optional(pool)
    .await
}

pub async fn get_connection_by_webhook_id(
    pool: &PgPool,
    webhook_id: &str,
) -> sqlx::Result<Option<LinearProjectConnection>> {
    sqlx::query_as!(
        LinearProjectConnection,
        r#"
        SELECT id, project_id, linear_team_id, linear_project_id,
               encrypted_api_key, linear_webhook_id, linear_webhook_secret,
               sync_enabled, created_at, updated_at
        FROM linear_project_connections
        WHERE linear_webhook_id = $1
        "#,
        webhook_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn list_all_active_connections(
    pool: &PgPool,
) -> sqlx::Result<Vec<LinearProjectConnection>> {
    sqlx::query_as!(
        LinearProjectConnection,
        r#"
        SELECT id, project_id, linear_team_id, linear_project_id,
               encrypted_api_key, linear_webhook_id, linear_webhook_secret,
               sync_enabled, created_at, updated_at
        FROM linear_project_connections
        WHERE sync_enabled = TRUE
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn list_connections_for_org(
    pool: &PgPool,
    user_id: Uuid,
) -> sqlx::Result<Vec<LinearProjectConnection>> {
    sqlx::query_as!(
        LinearProjectConnection,
        r#"
        SELECT lpc.id, lpc.project_id, lpc.linear_team_id, lpc.linear_project_id,
               lpc.encrypted_api_key, lpc.linear_webhook_id, lpc.linear_webhook_secret,
               lpc.sync_enabled, lpc.created_at, lpc.updated_at
        FROM linear_project_connections lpc
        JOIN projects p ON p.id = lpc.project_id
        JOIN organization_member_metadata om ON om.organization_id = p.organization_id
        WHERE om.user_id = $1
        "#,
        user_id
    )
    .fetch_all(pool)
    .await
}

pub async fn create_connection(
    pool: &PgPool,
    input: CreateConnectionInput,
) -> sqlx::Result<LinearProjectConnection> {
    sqlx::query_as!(
        LinearProjectConnection,
        r#"
        INSERT INTO linear_project_connections
            (project_id, linear_team_id, linear_project_id, encrypted_api_key)
        VALUES ($1, $2, $3, $4)
        RETURNING id, project_id, linear_team_id, linear_project_id,
                  encrypted_api_key, linear_webhook_id, linear_webhook_secret,
                  sync_enabled, created_at, updated_at
        "#,
        input.project_id,
        input.linear_team_id,
        input.linear_project_id,
        input.encrypted_api_key,
    )
    .fetch_one(pool)
    .await
}

pub async fn set_webhook(
    pool: &PgPool,
    connection_id: Uuid,
    webhook_id: &str,
    webhook_secret: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        r#"
        UPDATE linear_project_connections
        SET linear_webhook_id = $2, linear_webhook_secret = $3, updated_at = NOW()
        WHERE id = $1
        "#,
        connection_id,
        webhook_id,
        webhook_secret,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_connection(pool: &PgPool, id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("DELETE FROM linear_project_connections WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_sync_enabled(pool: &PgPool, id: Uuid, enabled: bool) -> sqlx::Result<()> {
    sqlx::query!(
        r#"
        UPDATE linear_project_connections
        SET sync_enabled = $2, updated_at = NOW()
        WHERE id = $1
        "#,
        id,
        enabled,
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Issue links ───────────────────────────────────────────────────────────────

pub async fn get_link_for_vk_issue(
    pool: &PgPool,
    vk_issue_id: Uuid,
) -> sqlx::Result<Option<LinearIssueLink>> {
    sqlx::query_as!(
        LinearIssueLink,
        r#"
        SELECT id, vk_issue_id, linear_issue_id, linear_issue_identifier,
               last_synced_at, created_at, gitnexus_analyzed, linear_ignored, worktree_branch
        FROM linear_issue_links
        WHERE vk_issue_id = $1
        "#,
        vk_issue_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn get_link_for_linear_issue(
    pool: &PgPool,
    linear_issue_id: &str,
) -> sqlx::Result<Option<LinearIssueLink>> {
    sqlx::query_as!(
        LinearIssueLink,
        r#"
        SELECT id, vk_issue_id, linear_issue_id, linear_issue_identifier,
               last_synced_at, created_at, gitnexus_analyzed, linear_ignored, worktree_branch
        FROM linear_issue_links
        WHERE linear_issue_id = $1
        "#,
        linear_issue_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn create_issue_link(
    pool: &PgPool,
    vk_issue_id: Uuid,
    linear_issue_id: &str,
    linear_issue_identifier: &str,
) -> sqlx::Result<LinearIssueLink> {
    sqlx::query_as!(
        LinearIssueLink,
        r#"
        INSERT INTO linear_issue_links
            (vk_issue_id, linear_issue_id, linear_issue_identifier, last_synced_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id, vk_issue_id, linear_issue_id, linear_issue_identifier,
                  last_synced_at, created_at, gitnexus_analyzed, linear_ignored, worktree_branch
        "#,
        vk_issue_id,
        linear_issue_id,
        linear_issue_identifier,
    )
    .fetch_one(pool)
    .await
}

pub async fn touch_link(pool: &PgPool, vk_issue_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        r#"
        UPDATE linear_issue_links
        SET last_synced_at = NOW()
        WHERE vk_issue_id = $1
        "#,
        vk_issue_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_linear_ignored(
    pool: &PgPool,
    linear_issue_id: &str,
    ignored: bool,
) -> sqlx::Result<()> {
    sqlx::query!(
        "UPDATE linear_issue_links SET linear_ignored = $2 WHERE linear_issue_id = $1",
        linear_issue_id,
        ignored,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_worktree_branch(
    pool: &PgPool,
    linear_issue_id: &str,
    branch: Option<&str>,
) -> sqlx::Result<()> {
    sqlx::query!(
        "UPDATE linear_issue_links SET worktree_branch = $2 WHERE linear_issue_id = $1",
        linear_issue_id,
        branch,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_issue_links_for_project(
    pool: &PgPool,
    project_id: Uuid,
) -> sqlx::Result<Vec<LinearIssueLink>> {
    sqlx::query_as!(
        LinearIssueLink,
        r#"
        SELECT ll.id, ll.vk_issue_id, ll.linear_issue_id, ll.linear_issue_identifier,
               ll.last_synced_at, ll.created_at, ll.gitnexus_analyzed, ll.linear_ignored, ll.worktree_branch
        FROM linear_issue_links ll
        JOIN issues i ON i.id = ll.vk_issue_id
        WHERE i.project_id = $1
        "#,
        project_id
    )
    .fetch_all(pool)
    .await
}

pub async fn delete_issue_link_by_vk_id(pool: &PgPool, vk_issue_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "DELETE FROM linear_issue_links WHERE vk_issue_id = $1",
        vk_issue_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Status mappings ───────────────────────────────────────────────────────────

pub async fn get_status_mappings(
    pool: &PgPool,
    connection_id: Uuid,
) -> sqlx::Result<Vec<LinearStatusMapping>> {
    sqlx::query_as!(
        LinearStatusMapping,
        r#"
        SELECT id, connection_id, vk_status_id, linear_state_id, linear_state_name
        FROM linear_status_mappings
        WHERE connection_id = $1
        "#,
        connection_id
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_status_mapping(
    pool: &PgPool,
    connection_id: Uuid,
    vk_status_id: Uuid,
    linear_state_id: &str,
    linear_state_name: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO linear_status_mappings
            (connection_id, vk_status_id, linear_state_id, linear_state_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (connection_id, vk_status_id) DO UPDATE
            SET linear_state_id   = EXCLUDED.linear_state_id,
                linear_state_name = EXCLUDED.linear_state_name
        "#,
        connection_id,
        vk_status_id,
        linear_state_id,
        linear_state_name,
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Comment links ─────────────────────────────────────────────────────────────

pub async fn get_comment_link(pool: &PgPool, vk_comment_id: Uuid) -> sqlx::Result<Option<String>> {
    let row = sqlx::query!(
        r#"
        SELECT linear_comment_id
        FROM linear_comment_links
        WHERE vk_comment_id = $1
        "#,
        vk_comment_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.linear_comment_id))
}

pub async fn create_comment_link(
    pool: &PgPool,
    connection_id: Uuid,
    vk_comment_id: Uuid,
    linear_comment_id: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO linear_comment_links
            (connection_id, vk_comment_id, linear_comment_id)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        "#,
        connection_id,
        vk_comment_id,
        linear_comment_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_comment_link(pool: &PgPool, vk_comment_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "DELETE FROM linear_comment_links WHERE vk_comment_id = $1",
        vk_comment_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Label links ───────────────────────────────────────────────────────────────

pub async fn get_label_links(
    pool: &PgPool,
    connection_id: Uuid,
) -> sqlx::Result<Vec<LinearLabelLink>> {
    sqlx::query_as!(
        LinearLabelLink,
        r#"
        SELECT id, connection_id, vk_tag_id, linear_label_id, linear_label_name
        FROM linear_label_links
        WHERE connection_id = $1
        "#,
        connection_id
    )
    .fetch_all(pool)
    .await
}

pub async fn fetch_fallback_status_id(
    pool: &PgPool,
    project_id: Uuid,
) -> sqlx::Result<Option<Uuid>> {
    let row = sqlx::query!(
        "SELECT id FROM project_statuses WHERE project_id = $1 ORDER BY sort_order LIMIT 1",
        project_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.id))
}

pub async fn upsert_label_link(
    pool: &PgPool,
    connection_id: Uuid,
    vk_tag_id: Uuid,
    linear_label_id: &str,
    linear_label_name: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO linear_label_links
            (connection_id, vk_tag_id, linear_label_id, linear_label_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (connection_id, vk_tag_id) DO UPDATE
            SET linear_label_id   = EXCLUDED.linear_label_id,
                linear_label_name = EXCLUDED.linear_label_name
        "#,
        connection_id,
        vk_tag_id,
        linear_label_id,
        linear_label_name,
    )
    .execute(pool)
    .await?;
    Ok(())
}
