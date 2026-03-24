use axum::{
    Router,
    body::Bytes,
    extract::{Extension, Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
};
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    auth::RequestContext,
    db::issue_comments::IssueCommentRepository,
    linear::{client, crypto, db, import, sync},
};

pub fn public_router() -> Router<AppState> {
    Router::new().route("/linear/webhook", post(handle_webhook))
}

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route(
            "/linear/connections",
            get(list_connections).post(create_connection),
        )
        .route(
            "/linear/connections/{id}",
            get(get_connection)
                .patch(update_connection)
                .delete(delete_connection),
        )
        .route(
            "/linear/connections/{id}/status-mappings",
            get(get_status_mappings).put(save_status_mappings),
        )
        .route(
            "/linear/connections/{id}/teams",
            get(list_teams_for_connection),
        )
        .route("/linear/connections/{id}/sync", post(trigger_sync))
        .route("/linear/connections/{id}/stats", get(get_connection_stats))
        .route(
            "/linear/connections/{id}/workflow-states",
            get(get_workflow_states),
        )
        .route("/linear/teams-preview", post(teams_preview))
        .route("/linear/pending-analysis", get(list_pending_analysis))
        .route("/linear/issues/{id}/mark-analyzed", post(mark_analyzed))
}

// ── teams_preview ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TeamsPreviewRequest {
    api_key: String,
}

async fn teams_preview(
    State(state): State<AppState>,
    Json(req): Json<TeamsPreviewRequest>,
) -> Response {
    match client::list_teams(&state.http_client, &req.api_key).await {
        Ok(teams) => Json(teams).into_response(),
        Err(e) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            format!("Invalid API key: {e}"),
        )
            .into_response(),
    }
}

// ── get_connection_stats ──────────────────────────────────────────────────────

async fn get_connection_stats(State(state): State<AppState>, Path(id): Path<Uuid>) -> Response {
    let conn = match db::get_connection_by_id(state.pool(), id).await {
        Ok(Some(c)) => c,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ConnectionStats {
        linked_count: i64,
        last_synced_at: Option<chrono::DateTime<chrono::Utc>>,
    }

    let row = sqlx::query!(
        r#"SELECT COUNT(*) as "count!", MAX(last_synced_at) as last_synced
           FROM linear_issue_links
           WHERE vk_issue_id IN (SELECT id FROM issues WHERE project_id = $1)"#,
        conn.project_id
    )
    .fetch_one(state.pool())
    .await;

    match row {
        Ok(r) => Json(ConnectionStats {
            linked_count: r.count,
            last_synced_at: r.last_synced,
        })
        .into_response(),
        Err(e) => {
            tracing::error!(?e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ── List connections ──────────────────────────────────────────────────────────

async fn list_connections(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    match db::list_connections_for_org(state.pool(), ctx.user.id).await {
        Ok(conns) => Json(
            conns
                .into_iter()
                .map(ConnectionResponse::from)
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to list linear connections");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ── Create connection ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateConnectionRequest {
    project_id: Uuid,
    api_key: String,
    linear_team_id: String,
    linear_project_id: Option<String>,
}

async fn create_connection(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(req): Json<CreateConnectionRequest>,
) -> Response {
    if let Err(e) = client::get_viewer(&state.http_client, &req.api_key).await {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            format!("Invalid Linear API key: {e}"),
        )
            .into_response();
    }

    let Some(enc_key) = state.config().linear_encryption_key.as_ref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "Linear encryption key not configured",
        )
            .into_response();
    };
    let encrypted = match crypto::encrypt(enc_key.expose_secret(), &req.api_key) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!(?e, "Failed to encrypt API key");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let conn = match db::create_connection(
        state.pool(),
        db::CreateConnectionInput {
            project_id: req.project_id,
            linear_team_id: req.linear_team_id.clone(),
            linear_project_id: req.linear_project_id.clone(),
            encrypted_api_key: encrypted,
        },
    )
    .await
    {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(?e, "Failed to create linear connection");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let webhook_url = format!("{}/v1/linear/webhook", state.server_public_base_url);
    let webhook_secret = generate_webhook_secret();
    match client::register_webhook(
        &state.http_client,
        &req.api_key,
        &req.linear_team_id,
        &webhook_url,
        &webhook_secret,
    )
    .await
    {
        Ok(webhook_id) => {
            let _ = db::set_webhook(state.pool(), conn.id, &webhook_id, &webhook_secret).await;
        }
        Err(e) => {
            tracing::warn!(
                ?e,
                "Failed to register Linear webhook — sync will not work until reconnected"
            );
        }
    }

    if let Ok(states) =
        client::list_workflow_states(&state.http_client, &req.api_key, &req.linear_team_id).await
        && let Ok(vk_statuses) = fetch_project_statuses(state.pool(), req.project_id).await
    {
        let auto_mappings = sync::auto_map_statuses(&vk_statuses, &states);
        for (vk_id, linear_id, linear_name) in auto_mappings {
            let _ = db::upsert_status_mapping(state.pool(), conn.id, vk_id, linear_id, linear_name)
                .await;
        }
    }

    let fallback_status = fetch_fallback_status_id(state.pool(), req.project_id)
        .await
        .ok()
        .flatten();
    if let Some(fallback_status_id) = fallback_status {
        let import_ctx = import::ImportContext {
            pool: state.pool().clone(),
            http_client: state.http_client.clone(),
            connection_id: conn.id,
            project_id: req.project_id,
            linear_team_id: req.linear_team_id.clone(),
            linear_project_id: req.linear_project_id.clone(),
            api_key: req.api_key.clone(),
            fallback_status_id,
            creator_user_id: ctx.user.id,
        };
        tokio::spawn(async move {
            if let Err(e) = import::run_initial_import(import_ctx).await {
                tracing::error!(?e, "Initial Linear import failed");
            }
        });
    }

    (StatusCode::CREATED, Json(ConnectionResponse::from(conn))).into_response()
}

// ── Get/Update/Delete connection ──────────────────────────────────────────────

async fn get_connection(State(state): State<AppState>, Path(id): Path<Uuid>) -> Response {
    match db::get_connection_by_id(state.pool(), id).await {
        Ok(Some(c)) => Json(ConnectionResponse::from(c)).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!(?e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateConnectionRequest {
    sync_enabled: Option<bool>,
}

async fn update_connection(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateConnectionRequest>,
) -> Response {
    if let Some(enabled) = req.sync_enabled
        && let Err(e) = db::set_sync_enabled(state.pool(), id, enabled).await
    {
        tracing::error!(?e);
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    StatusCode::OK.into_response()
}

async fn delete_connection(State(state): State<AppState>, Path(id): Path<Uuid>) -> Response {
    let conn = match db::get_connection_by_id(state.pool(), id).await {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!(?e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if let (Some(webhook_id), Some(enc_key)) = (
        &conn.linear_webhook_id,
        state.config().linear_encryption_key.as_ref(),
    ) && let Ok(api_key) = crypto::decrypt(enc_key.expose_secret(), &conn.encrypted_api_key)
    {
        let _ = client::delete_webhook(&state.http_client, &api_key, webhook_id).await;
    }

    if let Err(e) = db::delete_connection(state.pool(), id).await {
        tracing::error!(?e);
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    StatusCode::NO_CONTENT.into_response()
}

// ── Status mappings ───────────────────────────────────────────────────────────

async fn get_status_mappings(State(state): State<AppState>, Path(id): Path<Uuid>) -> Response {
    match db::get_status_mappings(state.pool(), id).await {
        Ok(m) => Json(m).into_response(),
        Err(e) => {
            tracing::error!(?e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[derive(Debug, Deserialize)]
struct SaveStatusMappingsRequest {
    mappings: Vec<StatusMappingEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusMappingEntry {
    vk_status_id: Uuid,
    linear_state_id: String,
    linear_state_name: String,
}

async fn save_status_mappings(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<SaveStatusMappingsRequest>,
) -> Response {
    for entry in &req.mappings {
        if let Err(e) = db::upsert_status_mapping(
            state.pool(),
            id,
            entry.vk_status_id,
            &entry.linear_state_id,
            &entry.linear_state_name,
        )
        .await
        {
            tracing::error!(?e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    StatusCode::OK.into_response()
}

async fn list_teams_for_connection(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Response {
    let conn = match db::get_connection_by_id(state.pool(), id).await {
        Ok(Some(c)) => c,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    let enc_key = match state.config().linear_encryption_key.as_ref() {
        Some(k) => k,
        None => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let api_key = match crypto::decrypt(enc_key.expose_secret(), &conn.encrypted_api_key) {
        Ok(k) => k,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    match client::list_teams(&state.http_client, &api_key).await {
        Ok(teams) => Json(teams).into_response(),
        Err(e) => {
            tracing::error!(?e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn trigger_sync(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    let conn = match db::get_connection_by_id(state.pool(), id).await {
        Ok(Some(c)) => c,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    let enc_key = match state.config().linear_encryption_key.as_ref() {
        Some(k) => k,
        None => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let api_key = match crypto::decrypt(enc_key.expose_secret(), &conn.encrypted_api_key) {
        Ok(k) => k,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if let Some(fallback_status_id) = fetch_fallback_status_id(state.pool(), conn.project_id)
        .await
        .ok()
        .flatten()
    {
        let import_ctx = import::ImportContext {
            pool: state.pool().clone(),
            http_client: state.http_client.clone(),
            connection_id: conn.id,
            project_id: conn.project_id,
            linear_team_id: conn.linear_team_id.clone(),
            linear_project_id: conn.linear_project_id.clone(),
            api_key,
            fallback_status_id,
            creator_user_id: ctx.user.id,
        };
        tokio::spawn(async move {
            if let Err(e) = import::run_initial_import(import_ctx).await {
                tracing::error!(?e, "Manual sync failed");
            }
        });
    }
    StatusCode::ACCEPTED.into_response()
}

async fn get_workflow_states(State(state): State<AppState>, Path(id): Path<Uuid>) -> Response {
    let conn = match db::get_connection_by_id(state.pool(), id).await {
        Ok(Some(c)) => c,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    let enc_key = match state.config().linear_encryption_key.as_ref() {
        Some(k) => k,
        None => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let api_key = match crypto::decrypt(enc_key.expose_secret(), &conn.encrypted_api_key) {
        Ok(k) => k,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    match client::list_workflow_states(&state.http_client, &api_key, &conn.linear_team_id).await {
        Ok(states) => Json(states).into_response(),
        Err(e) => {
            tracing::error!(?e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ── Webhook handler ───────────────────────────────────────────────────────────

async fn handle_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let payload: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    let webhook_id = match payload["webhookId"].as_str() {
        Some(id) => id.to_string(),
        None => return StatusCode::BAD_REQUEST.into_response(),
    };

    let conn = match db::get_connection_by_webhook_id(state.pool(), &webhook_id).await {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let sig = headers
        .get("linear-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let secret = conn.linear_webhook_secret.as_deref().unwrap_or("");
    if !crate::linear::webhook::verify_signature(secret.as_bytes(), sig, &body) {
        tracing::warn!(
            "Invalid Linear webhook signature for connection {}",
            conn.id
        );
        return StatusCode::UNAUTHORIZED.into_response();
    }

    let state_clone = state.clone();
    let conn_clone = conn.clone();
    tokio::spawn(async move {
        if let Err(e) = process_webhook_event(state_clone, conn_clone, payload).await {
            tracing::error!(?e, "Error processing Linear webhook event");
        }
    });

    StatusCode::OK.into_response()
}

async fn process_webhook_event(
    state: AppState,
    conn: db::LinearProjectConnection,
    payload: serde_json::Value,
) -> anyhow::Result<()> {
    let event_type = payload["type"].as_str().unwrap_or("");
    let action = payload["action"].as_str().unwrap_or("");
    let data = &payload["data"];

    match event_type {
        "Issue" => handle_linear_issue_event(&state, &conn, action, data).await?,
        "Comment" => handle_linear_comment_event(&state, &conn, action, data).await?,
        _ => {}
    }
    Ok(())
}

async fn handle_linear_issue_event(
    state: &AppState,
    conn: &db::LinearProjectConnection,
    action: &str,
    data: &serde_json::Value,
) -> anyhow::Result<()> {
    use crate::linear::loop_guard::{self, SyncDirection};

    let linear_issue_id = data["id"].as_str().unwrap_or("");
    if linear_issue_id.is_empty() {
        return Ok(());
    }

    let labels: Vec<String> = data["labels"]["nodes"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|l| l["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let is_ignored = labels
        .iter()
        .any(|l| l.eq_ignore_ascii_case(crate::linear::client::IGNORE_LABEL_NAME));

    match action {
        "create" => {
            if is_ignored {
                return Ok(());
            }
            if db::get_link_for_linear_issue(state.pool(), linear_issue_id)
                .await?
                .is_some()
            {
                return Ok(());
            }
            let status_id = resolve_status_id(state, conn, data).await?;
            let priority =
                sync::linear_priority_to_vk(data["priority"].as_i64().unwrap_or(0) as i32);
            // Webhooks have no RequestContext — resolve a real user id from the project's org.
            let creator_user_id = sqlx::query!(
                r#"SELECT om.user_id AS "user_id!: Uuid"
                FROM projects p
                JOIN organization_member_metadata om ON om.organization_id = p.organization_id
                WHERE p.id = $1
                LIMIT 1"#,
                conn.project_id
            )
            .fetch_optional(state.pool())
            .await
            .ok()
            .flatten()
            .map(|r| r.user_id)
            .unwrap_or(Uuid::nil());
            let result = crate::db::issues::IssueRepository::create(
                state.pool(),
                None,
                conn.project_id,
                status_id,
                data["title"].as_str().unwrap_or("").to_string(),
                data["description"].as_str().map(String::from),
                priority,
                None,
                data["dueDate"].as_str().and_then(|d| d.parse().ok()),
                None,
                0.0,
                None,
                None,
                serde_json::Value::Object(Default::default()),
                creator_user_id,
            )
            .await?;
            db::create_issue_link(
                state.pool(),
                result.data.id,
                linear_issue_id,
                data["identifier"].as_str().unwrap_or(""),
            )
            .await?;
        }
        "update" => {
            if let Some(link) = db::get_link_for_linear_issue(state.pool(), linear_issue_id).await?
            {
                if is_ignored {
                    db::delete_issue_link_by_vk_id(state.pool(), link.vk_issue_id).await?;
                    crate::db::issues::IssueRepository::delete(state.pool(), link.vk_issue_id)
                        .await
                        .ok();
                    return Ok(());
                }
                if loop_guard::outbound_in_flight(state.pool(), conn.id, link.vk_issue_id).await? {
                    return Ok(());
                }
                if !loop_guard::try_acquire(
                    state.pool(),
                    conn.id,
                    link.vk_issue_id,
                    SyncDirection::Inbound,
                )
                .await?
                {
                    return Ok(());
                }
                let status_id = resolve_status_id(state, conn, data).await?;
                let priority =
                    sync::linear_priority_to_vk(data["priority"].as_i64().unwrap_or(0) as i32);
                crate::db::issues::IssueRepository::update(
                    state.pool(),
                    link.vk_issue_id,
                    Some(status_id),
                    Some(data["title"].as_str().unwrap_or("").to_string()),
                    Some(data["description"].as_str().map(String::from)),
                    Some(priority),
                    None,
                    Some(data["dueDate"].as_str().and_then(|d| d.parse().ok())),
                    None,
                    None,
                    None,
                    None,
                    None,
                )
                .await?;
                loop_guard::release(
                    state.pool(),
                    conn.id,
                    link.vk_issue_id,
                    SyncDirection::Inbound,
                )
                .await?;
                db::touch_link(state.pool(), link.vk_issue_id).await?;
            }
        }
        "remove" => {
            if let Some(link) = db::get_link_for_linear_issue(state.pool(), linear_issue_id).await?
            {
                db::delete_issue_link_by_vk_id(state.pool(), link.vk_issue_id).await?;
                crate::db::issues::IssueRepository::delete(state.pool(), link.vk_issue_id)
                    .await
                    .ok();
            }
        }
        _ => {}
    }
    Ok(())
}

async fn handle_linear_comment_event(
    state: &AppState,
    conn: &db::LinearProjectConnection,
    action: &str,
    data: &serde_json::Value,
) -> anyhow::Result<()> {
    let linear_comment_id = data["id"].as_str().unwrap_or("");
    let linear_issue_id = data["issue"]["id"].as_str().unwrap_or("");
    let body = data["body"].as_str().unwrap_or("");

    let issue_link = match db::get_link_for_linear_issue(state.pool(), linear_issue_id).await? {
        Some(l) => l,
        None => return Ok(()),
    };

    // Decrypt API key — reserved for future outbound use in Task 12
    let enc_key = match state.config().linear_encryption_key.as_ref() {
        Some(k) => k,
        None => return Ok(()),
    };
    let _api_key = match crypto::decrypt(enc_key.expose_secret(), &conn.encrypted_api_key) {
        Ok(k) => k,
        Err(_) => return Ok(()),
    };

    match action {
        "create" => {
            let vk_comment_id = create_vk_comment(state, issue_link.vk_issue_id, body).await?;
            db::create_comment_link(state.pool(), conn.id, vk_comment_id, linear_comment_id)
                .await?;
        }
        "update" => {
            if let Some(vk_comment_id) =
                get_vk_comment_by_linear_id(state.pool(), conn.id, linear_comment_id).await?
            {
                update_vk_comment(state, vk_comment_id, body).await?;
            }
        }
        "remove" => {
            if let Some(vk_comment_id) =
                get_vk_comment_by_linear_id(state.pool(), conn.id, linear_comment_id).await?
            {
                delete_vk_comment(state, vk_comment_id).await?;
                db::delete_comment_link(state.pool(), vk_comment_id).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

async fn resolve_status_id(
    state: &AppState,
    conn: &db::LinearProjectConnection,
    data: &serde_json::Value,
) -> anyhow::Result<Uuid> {
    let linear_state_id = data["state"]["id"].as_str().unwrap_or("");
    let mappings = db::get_status_mappings(state.pool(), conn.id).await?;
    let fallback = fetch_fallback_status_id(state.pool(), conn.project_id)
        .await?
        .unwrap_or(Uuid::nil());
    Ok(sync::map_linear_state_to_vk(
        linear_state_id,
        &mappings,
        fallback,
    ))
}

async fn get_vk_comment_by_linear_id(
    pool: &sqlx::PgPool,
    connection_id: Uuid,
    linear_comment_id: &str,
) -> anyhow::Result<Option<Uuid>> {
    let row = sqlx::query!(
        "SELECT vk_comment_id FROM linear_comment_links WHERE connection_id = $1 AND linear_comment_id = $2",
        connection_id,
        linear_comment_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.vk_comment_id))
}

async fn create_vk_comment(state: &AppState, issue_id: Uuid, body: &str) -> anyhow::Result<Uuid> {
    let resp = IssueCommentRepository::create(
        state.pool(),
        None,
        issue_id,
        Uuid::nil(),
        None,
        body.to_string(),
    )
    .await?;
    Ok(resp.data.id)
}

async fn update_vk_comment(state: &AppState, comment_id: Uuid, body: &str) -> anyhow::Result<()> {
    IssueCommentRepository::update(state.pool(), comment_id, Some(body.to_string())).await?;
    Ok(())
}

async fn delete_vk_comment(state: &AppState, comment_id: Uuid) -> anyhow::Result<()> {
    IssueCommentRepository::delete(state.pool(), comment_id).await?;
    Ok(())
}

// ── GitNexus analysis ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingAnalysisIssue {
    pub issue_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub worktree_branch: Option<String>,
    pub comments: Vec<String>,
}

async fn list_pending_analysis(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    let rows = sqlx::query!(
        r#"
        SELECT i.id AS "id!: Uuid", i.title, i.description, lil.worktree_branch
        FROM issues i
        JOIN linear_issue_links lil ON lil.vk_issue_id = i.id
        JOIN projects p ON p.id = i.project_id
        JOIN organization_member_metadata om ON om.organization_id = p.organization_id
        WHERE om.user_id = $1
          AND lil.gitnexus_analyzed = FALSE
        "#,
        ctx.user.id
    )
    .fetch_all(state.pool())
    .await;

    match rows {
        Ok(rows) => {
            let mut issues = Vec::with_capacity(rows.len());
            for r in rows {
                let comments = sqlx::query_scalar!(
                    r#"SELECT message AS "message!" FROM issue_comments WHERE issue_id = $1 ORDER BY created_at"#,
                    r.id
                )
                .fetch_all(state.pool())
                .await
                .unwrap_or_default();
                issues.push(PendingAnalysisIssue {
                    issue_id: r.id,
                    title: r.title,
                    description: r.description,
                    worktree_branch: r.worktree_branch,
                    comments,
                });
            }
            Json(issues).into_response()
        }
        Err(e) => {
            tracing::error!(?e, "Failed to list pending analysis issues");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn mark_analyzed(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_id): Path<Uuid>,
) -> Response {
    // Verify the user has access to this issue
    let ok = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM issues i
            JOIN projects p ON p.id = i.project_id
            JOIN organization_member_metadata om ON om.organization_id = p.organization_id
            WHERE i.id = $1 AND om.user_id = $2
        ) AS "exists!"
        "#,
        issue_id,
        ctx.user.id
    )
    .fetch_one(state.pool())
    .await
    .unwrap_or(false);

    if !ok {
        return StatusCode::FORBIDDEN.into_response();
    }

    match sqlx::query!(
        "UPDATE linear_issue_links SET gitnexus_analyzed = TRUE WHERE vk_issue_id = $1",
        issue_id
    )
    .execute(state.pool())
    .await
    {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to mark issue as analyzed");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionResponse {
    id: Uuid,
    project_id: Uuid,
    linear_team_id: String,
    linear_project_id: Option<String>,
    sync_enabled: bool,
    has_webhook: bool,
    created_at: chrono::DateTime<chrono::Utc>,
}

impl From<db::LinearProjectConnection> for ConnectionResponse {
    fn from(c: db::LinearProjectConnection) -> Self {
        Self {
            id: c.id,
            project_id: c.project_id,
            linear_team_id: c.linear_team_id,
            linear_project_id: c.linear_project_id,
            sync_enabled: c.sync_enabled,
            has_webhook: c.linear_webhook_id.is_some(),
            created_at: c.created_at,
        }
    }
}

fn generate_webhook_secret() -> String {
    use aes_gcm::aead::{OsRng, rand_core::RngCore};
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

async fn fetch_project_statuses(
    pool: &sqlx::PgPool,
    project_id: Uuid,
) -> sqlx::Result<Vec<(Uuid, String)>> {
    let rows = sqlx::query!(
        "SELECT id, name FROM project_statuses WHERE project_id = $1 ORDER BY sort_order",
        project_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| (r.id, r.name)).collect())
}

pub async fn fetch_fallback_status_id(
    pool: &sqlx::PgPool,
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
