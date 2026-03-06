use anyhow::Context as _;
use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{post, put},
};
use desktop_bridge::signing::SigningContext;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::DeploymentImpl;

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/open-remote-editor", post(open_remote_editor))
        .route(
            "/open-remote-editor/first-workspace",
            post(open_first_workspace_in_remote_editor),
        )
        .route(
            "/open-remote-editor/credentials",
            put(upsert_open_remote_editor_credentials),
        )
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct OpenRemoteEditorRequest {
    pub host_id: String,
    pub workspace_path: String,
    #[serde(default)]
    pub editor_type: Option<String>,
    pub relay_session_base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct OpenFirstWorkspaceInRemoteEditorRequest {
    pub host_id: String,
    #[serde(default)]
    pub editor_type: Option<String>,
    pub relay_session_base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UpsertRelayHostCredentialsRequest {
    pub host_id: String,
    pub signing_session_id: String,
    pub private_key_jwk: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UpsertRelayHostCredentialsResponse {
    pub upserted: bool,
}

pub async fn open_remote_editor(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<OpenRemoteEditorRequest>,
) -> Response {
    let signing_ctx = match get_signing_ctx(&deployment, &req.host_id).await {
        Ok(signing_ctx) => signing_ctx,
        Err(response) => return response,
    };

    open_remote_editor_with_workspace_path(
        &deployment,
        signing_ctx,
        req.workspace_path,
        req.editor_type,
        req.relay_session_base_url,
    )
    .await
}

pub async fn open_first_workspace_in_remote_editor(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<OpenFirstWorkspaceInRemoteEditorRequest>,
) -> Response {
    let signing_ctx = match get_signing_ctx(&deployment, &req.host_id).await {
        Ok(signing_ctx) => signing_ctx,
        Err(response) => return response,
    };

    let workspaces: Vec<RelayWorkspace> = match get_signed_relay_api(
        &req.relay_session_base_url,
        "/api/task-attempts",
        &signing_ctx,
    )
    .await
    {
        Ok(workspaces) => workspaces,
        Err(error) => {
            tracing::warn!(
                ?error,
                host_id = %req.host_id,
                "Failed to fetch host workspaces"
            );
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Failed to load host workspaces via relay"
                )),
            )
                .into_response();
        }
    };

    let Some(first_workspace) = workspaces.first() else {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::error("No workspaces found on host")),
        )
            .into_response();
    };

    let editor_path: RelayEditorPathResponse = match get_signed_relay_api(
        &req.relay_session_base_url,
        &format!("/api/task-attempts/{}/editor-path", first_workspace.id),
        &signing_ctx,
    )
    .await
    {
        Ok(path) => path,
        Err(error) => {
            tracing::warn!(
                ?error,
                host_id = %req.host_id,
                workspace_id = %first_workspace.id,
                "Failed to resolve workspace editor path"
            );
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(
                    "Failed to resolve editor path for host workspace"
                )),
            )
                .into_response();
        }
    };

    open_remote_editor_with_workspace_path(
        &deployment,
        signing_ctx,
        editor_path.workspace_path,
        req.editor_type,
        req.relay_session_base_url,
    )
    .await
}

pub async fn upsert_open_remote_editor_credentials(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<UpsertRelayHostCredentialsRequest>,
) -> Response {
    match deployment
        .upsert_relay_host_credentials(req.host_id, req.signing_session_id, req.private_key_jwk)
        .await
    {
        Ok(()) => (
            StatusCode::OK,
            Json(ApiResponse::<UpsertRelayHostCredentialsResponse>::success(
                UpsertRelayHostCredentialsResponse { upserted: true },
            )),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(?error, "Failed to persist relay host credentials");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<UpsertRelayHostCredentialsResponse>::error(
                    "Failed to persist relay host credentials",
                )),
            )
                .into_response()
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct RelayWorkspace {
    id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct RelayEditorPathResponse {
    workspace_path: String,
}

async fn get_signing_ctx(
    deployment: &DeploymentImpl,
    host_id: &str,
) -> Result<SigningContext, Response> {
    let Some(credentials) = deployment.get_relay_host_credentials(host_id).await else {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::error(&format!(
                "Open-in-IDE credentials are unavailable for host '{host_id}'"
            ))),
        )
            .into_response());
    };

    SigningContext::from_jwk(credentials.signing_session_id, &credentials.private_key_jwk).map_err(
        |error| {
            (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(&error.to_string())),
            )
                .into_response()
        },
    )
}

async fn open_remote_editor_with_workspace_path(
    deployment: &DeploymentImpl,
    signing_ctx: SigningContext,
    workspace_path: String,
    editor_type: Option<String>,
    relay_session_base_url: String,
) -> Response {
    match deployment
        .desktop_bridge()
        .open_remote_editor(
            desktop_bridge::service::OpenRemoteEditorOptions {
                workspace_path,
                editor_type,
                relay_session_base_url,
            },
            signing_ctx,
        )
        .await
    {
        Ok(response) => (
            StatusCode::OK,
            Json(ApiResponse::<
                desktop_bridge::service::OpenRemoteEditorResponse,
            >::success(response)),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(?error, "Open remote editor failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<
                    desktop_bridge::service::OpenRemoteEditorResponse,
                >::error(&error.to_string())),
            )
                .into_response()
        }
    }
}

async fn get_signed_relay_api<TData>(
    relay_session_base_url: &str,
    path: &str,
    signing_ctx: &SigningContext,
) -> anyhow::Result<TData>
where
    TData: DeserializeOwned,
{
    let signed_path = desktop_bridge::signing::sign_path(signing_ctx, "GET", path);
    let url = format!(
        "{}{}",
        relay_session_base_url.trim_end_matches('/'),
        signed_path
    );

    let response = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .with_context(|| format!("Relay request failed for '{path}'"))?;

    let status = response.status();
    let payload = response
        .json::<ApiResponse<TData>>()
        .await
        .with_context(|| format!("Failed to decode relay response for '{path}'"))?;

    if !status.is_success() || !payload.is_success() {
        let message = payload
            .message()
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("Relay request failed for '{path}'"));
        anyhow::bail!("{message}");
    }

    payload
        .into_data()
        .ok_or_else(|| anyhow::anyhow!("Missing response data for relay path '{path}'"))
}
