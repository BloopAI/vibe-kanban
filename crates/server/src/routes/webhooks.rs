use axum::{
    Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    project::Project,
    webhook::{CreateWebhook, UpdateWebhook, Webhook, WebhookResponse},
};
use deployment::Deployment;
use services::services::webhook::WebhookService;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Hop-by-hop and virtual-host headers that must not be forwarded.
/// Step 6 (H3): expanded blocklist applied consistently in validation.
const RESERVED_HEADERS: &[&str] = &[
    "host",
    "content-type",
    "transfer-encoding",
    "content-length",
    "connection",
    "keep-alive",
    "proxy-authorization",
    "te",
    "trailer",
    "upgrade",
];

/// Validate user-supplied header map: reject reserved names and invalid name/value bytes.
fn validate_headers(headers: &std::collections::HashMap<String, String>) -> Result<(), ApiError> {
    for (k, v) in headers {
        let lower = k.to_lowercase();
        if lower.starts_with("x-vkswarm-") || RESERVED_HEADERS.contains(&lower.as_str()) {
            return Err(ApiError::BadRequest(format!(
                "Header name is reserved: {k}"
            )));
        }
        axum::http::HeaderName::from_bytes(k.as_bytes())
            .map_err(|_| ApiError::BadRequest(format!("Invalid header name: {k}")))?;
        axum::http::HeaderValue::from_str(v)
            .map_err(|_| ApiError::BadRequest(format!("Invalid header value for: {k}")))?;
    }
    Ok(())
}

/// GET /api/webhooks — list global webhooks (headers masked)
pub async fn list_global_webhooks(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<WebhookResponse>>>, ApiError> {
    let webhooks = Webhook::find_global(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(
        webhooks.into_iter().map(|w| w.into_response()).collect(),
    )))
}

/// GET /api/webhooks/:id — get a single webhook by ID (headers masked)
pub async fn get_webhook(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<WebhookResponse>>, ApiError> {
    let webhook = Webhook::find_by_id(&deployment.db().pool, id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;
    Ok(ResponseJson(ApiResponse::success(webhook.into_response())))
}

/// POST /api/webhooks — create global webhook
pub async fn create_global_webhook(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateWebhook>,
) -> Result<ResponseJson<ApiResponse<WebhookResponse>>, ApiError> {
    if payload.events.is_empty() {
        return Err(ApiError::BadRequest(
            "At least one event type must be selected.".into(),
        ));
    }
    validate_headers(&payload.headers)?;
    WebhookService::validate_url_async(&payload.url)
        .await
        .map_err(ApiError::BadRequest)?;
    let webhook = Webhook::create(&deployment.db().pool, None, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(webhook.into_response())))
}

/// GET /api/projects/:project_id/webhooks — list project webhooks
pub async fn list_project_webhooks(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<WebhookResponse>>>, ApiError> {
    let webhooks = Webhook::find_for_project(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(ApiResponse::success(
        webhooks.into_iter().map(|w| w.into_response()).collect(),
    )))
}

/// POST /api/projects/:project_id/webhooks — create project webhook
pub async fn create_project_webhook(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<CreateWebhook>,
) -> Result<ResponseJson<ApiResponse<WebhookResponse>>, ApiError> {
    // Verify project exists
    if Project::find_by_id(&deployment.db().pool, project_id)
        .await?
        .is_none()
    {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }
    if payload.events.is_empty() {
        return Err(ApiError::BadRequest(
            "At least one event type must be selected.".into(),
        ));
    }
    validate_headers(&payload.headers)?;
    WebhookService::validate_url_async(&payload.url)
        .await
        .map_err(ApiError::BadRequest)?;
    let webhook = Webhook::create(&deployment.db().pool, Some(project_id), &payload).await?;
    Ok(ResponseJson(ApiResponse::success(webhook.into_response())))
}

/// PUT /api/webhooks/:id — update webhook
pub async fn update_webhook(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateWebhook>,
) -> Result<ResponseJson<ApiResponse<WebhookResponse>>, ApiError> {
    if let Some(events) = &payload.events {
        if events.is_empty() {
            return Err(ApiError::BadRequest(
                "At least one event type must be selected.".into(),
            ));
        }
    }
    if let Some(headers) = &payload.headers {
        validate_headers(headers)?;
    }
    if let Some(url) = &payload.url {
        WebhookService::validate_url_async(url)
            .await
            .map_err(ApiError::BadRequest)?;
    }
    let webhook = Webhook::update(&deployment.db().pool, id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(webhook.into_response())))
}

/// DELETE /api/webhooks/:id — delete webhook
pub async fn delete_webhook(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows = Webhook::delete(&deployment.db().pool, id).await?;
    if rows == 0 {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }
    Ok(ResponseJson(ApiResponse::success(())))
}

/// POST /api/webhooks/:id/test — fire a test payload to the webhook's URL
/// Steps 7 (H1+H2+M7): add Timestamp header, fix header order, fix ok threshold.
pub async fn test_webhook(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<serde_json::Value>>, ApiError> {
    let webhook = Webhook::find_by_id(&deployment.db().pool, id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Step 1 (C1): resolve_pinned checks all IPs and returns a pinned SocketAddr.
    // This closes the DNS rebind TOCTOU gap — the same resolved IP is used for the
    // actual HTTP connection, preventing a flip between validate and send.
    let resolved_addr = WebhookService::resolve_pinned(&webhook.url)
        .await
        .map_err(ApiError::BadRequest)?;
    let host = url::Url::parse(&webhook.url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
        .unwrap_or_default();

    let test_payload = serde_json::json!({
        "event": { "type": "test", "timestamp": chrono::Utc::now().to_rfc3339(), "test": true },
        "project": { "id": "00000000-0000-0000-0000-000000000000", "name": "Test Project" },
        "task": { "id": "00000000-0000-0000-0000-000000000001", "title": "Test Task", "description": null, "status": "InProgress", "labels": [] },
        "task_attempt": { "id": "00000000-0000-0000-0000-000000000002", "executor": "ClaudeCode", "branch": "test-branch", "worktree_path": null },
        "execution_process": { "id": "00000000-0000-0000-0000-000000000003", "run_reason": "CodingAgent" },
    });
    let body = serde_json::to_string(&test_payload).unwrap_or_else(|_| "{}".into());

    // Step 7 (H1): compute ts once so Timestamp header and signature use the same value
    let ts = chrono::Utc::now().timestamp().to_string();

    let start = std::time::Instant::now();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none()) // prevent SSRF via redirect
        .resolve_to_addrs(&host, &[resolved_addr]) // C1: pin to verified address
        .build()
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    // Step 7 (H2): user headers FIRST, then system headers (match dispatch() pattern)
    let mut builder = client.post(&webhook.url);

    // Apply user headers first (filtered with expanded blocklist — Step 6 H3)
    for (k, v) in webhook.parse_headers() {
        let name_lower = k.to_lowercase();
        if name_lower.starts_with("x-vkswarm-") || RESERVED_HEADERS.contains(&name_lower.as_str()) {
            continue;
        }
        // Defensive header application — skip malformed bytes (Step 5 H5)
        match (
            axum::http::HeaderName::from_bytes(k.as_bytes()),
            axum::http::HeaderValue::from_str(&v),
        ) {
            (Ok(name), Ok(value)) => builder = builder.header(name, value),
            _ => {} // silently skip malformed stored headers in test path
        }
    }

    // System headers after user headers so they cannot be overridden
    builder = builder
        .header("Content-Type", "application/json")
        .header("X-VkSwarm-Event", "test")
        .header("X-VkSwarm-Timestamp", &ts); // Step 7 (H1): add Timestamp header

    if let Some(secret) = &webhook.secret {
        let sig_input = format!("{ts}.{body}");
        let sig = WebhookService::make_signature(secret, &sig_input);
        builder = builder.header("X-VkSwarm-Signature", format!("sha256={sig}"));
    }

    match builder.body(body).send().await {
        Ok(resp) => {
            let status_code = resp.status().as_u16();
            let response_time_ms = start.elapsed().as_millis() as u64;
            let raw = resp.text().await.unwrap_or_default();
            // UTF-8-safe truncation at 500 characters (M7)
            let preview: String = raw
                .char_indices()
                .take_while(|(i, _)| *i < 500)
                .map(|(_, c)| c)
                .collect();
            // Step 7 (H1+M7): use is_success() instead of < 400 (fixes 3xx being reported as ok)
            let ok = status_code >= 200 && status_code < 300;
            Ok(ResponseJson(ApiResponse::success(serde_json::json!({
                "ok": ok,
                "status_code": status_code,
                "response_time_ms": response_time_ms,
                "body_preview": preview,
            }))))
        }
        Err(e) => {
            // Step 7 (info-disclosure fix): don't expose internal error details to caller
            tracing::warn!(webhook_id = %webhook.id, error = ?e, "Test webhook transport error");
            Ok(ResponseJson(ApiResponse::success(serde_json::json!({
                "ok": false,
                "error": "Request failed",
            }))))
        }
    }
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .nest(
            "/webhooks",
            Router::new()
                .route("/", get(list_global_webhooks).post(create_global_webhook))
                .route(
                    "/{id}",
                    get(get_webhook).put(update_webhook).delete(delete_webhook),
                )
                .route("/{id}/test", post(test_webhook)),
        )
        .nest(
            "/projects/{project_id}/webhooks",
            Router::new().route("/", get(list_project_webhooks).post(create_project_webhook)),
        )
}
