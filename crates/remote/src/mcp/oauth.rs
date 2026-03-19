use axum::{
    Form, Json, Router,
    body::Body,
    extract::{FromRequest, Query, Request, State},
    http::{HeaderValue, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Serialize;
use tracing::{debug, warn};

use crate::{
    AppState,
    auth::{
        request_context_from_access_token,
        server::{
            self, AuthorizeQuery, OAuthCallbackQuery, OAuthServerPolicy, RegisterClientRequest,
            TokenRequest,
        },
    },
};

const MCP_CLIENT_ID_AUDIENCE: &str = "mcp_client";
const MCP_AUTH_CODE_AUDIENCE: &str = "mcp_auth_code";
const MCP_CALLBACK_PATH: &str = "/oauth/mcp/callback";
const MCP_AUTHORIZATION_PATH: &str = "/oauth/mcp/authorize";
const MCP_TOKEN_PATH: &str = "/oauth/mcp/token";
const MCP_REGISTRATION_PATH: &str = "/oauth/mcp/register";

fn mcp_oauth_policy() -> OAuthServerPolicy {
    OAuthServerPolicy {
        client_id_audience: MCP_CLIENT_ID_AUDIENCE,
        auth_code_audience: MCP_AUTH_CODE_AUDIENCE,
        authorization_endpoint_path: MCP_AUTHORIZATION_PATH,
        token_endpoint_path: MCP_TOKEN_PATH,
        registration_endpoint_path: MCP_REGISTRATION_PATH,
        callback_path: MCP_CALLBACK_PATH,
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/.well-known/oauth-authorization-server",
            get(authorization_server_metadata),
        )
        .route(
            "/.well-known/oauth-protected-resource",
            get(protected_resource_metadata),
        )
        .route(
            "/.well-known/oauth-authorization-server/v1/mcp",
            get(authorization_server_metadata),
        )
        .route(
            "/.well-known/oauth-protected-resource/v1/mcp",
            get(protected_resource_metadata),
        )
        .route(
            "/v1/mcp/.well-known/oauth-authorization-server",
            get(authorization_server_metadata),
        )
        .route(
            "/v1/mcp/.well-known/oauth-protected-resource",
            get(protected_resource_metadata),
        )
        .route(MCP_REGISTRATION_PATH, post(register_client))
        .route(MCP_AUTHORIZATION_PATH, get(authorize))
        .route(MCP_CALLBACK_PATH, get(authorize_callback))
        .route(MCP_TOKEN_PATH, post(token))
}

pub async fn mcp_auth_middleware(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let bearer = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim);

    let Some(access_token) = bearer else {
        debug!("mcp_auth: no bearer token found");
        return unauthorized_mcp_response(&state, "invalid_token");
    };

    let ctx = match request_context_from_access_token(&state, access_token).await {
        Ok(ctx) => ctx,
        Err(error) => {
            warn!(?error, "mcp_auth: failed to decode access token");
            return unauthorized_mcp_response(&state, "invalid_token");
        }
    };

    req.extensions_mut().insert(ctx);
    next.run(req).await
}

async fn authorization_server_metadata(
    State(state): State<AppState>,
) -> Json<server::AuthorizationServerMetadata> {
    server::authorization_server_metadata(State(state), mcp_oauth_policy()).await
}

#[derive(Debug, Serialize)]
struct ProtectedResourceMetadata {
    resource: String,
    authorization_servers: Vec<String>,
    bearer_methods_supported: Vec<&'static str>,
    resource_documentation: String,
}

async fn protected_resource_metadata(
    State(state): State<AppState>,
) -> Json<ProtectedResourceMetadata> {
    let base = state.server_public_base_url.trim_end_matches('/');

    Json(ProtectedResourceMetadata {
        resource: mcp_resource_uri(&state),
        authorization_servers: vec![base.to_string()],
        bearer_methods_supported: vec!["header"],
        resource_documentation: format!("{base}/v1/mcp"),
    })
}

async fn register_client(
    State(state): State<AppState>,
    Json(payload): Json<RegisterClientRequest>,
) -> Response {
    server::register_client(State(state), mcp_oauth_policy(), Json(payload)).await
}

async fn authorize(
    State(state): State<AppState>,
    uri: axum::http::Uri,
    Query(query): Query<AuthorizeQuery>,
) -> Response {
    let resource_uri = mcp_resource_uri(&state);
    server::authorize(
        State(state),
        mcp_oauth_policy(),
        uri,
        Query(query),
        resource_uri,
    )
    .await
}

async fn authorize_callback(
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Response {
    server::authorize_callback(State(state), mcp_oauth_policy(), Query(query)).await
}

async fn token(State(state): State<AppState>, req: Request) -> Response {
    let resource_uri = mcp_resource_uri(&state);
    let content_type = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let payload = if content_type.starts_with("application/x-www-form-urlencoded") {
        match Form::<TokenRequest>::from_request(req, &()).await {
            Ok(Form(payload)) => payload,
            Err(_) => {
                return server::oauth_error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_request",
                    Some("Expected request with Content-Type: application/x-www-form-urlencoded"),
                );
            }
        }
    } else {
        match Json::<TokenRequest>::from_request(req, &()).await {
            Ok(Json(payload)) => payload,
            Err(_) => {
                return server::oauth_error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_request",
                    Some(
                        "Expected request with Content-Type: application/x-www-form-urlencoded or application/json",
                    ),
                );
            }
        }
    };

    server::token(State(state), mcp_oauth_policy(), payload, resource_uri).await
}

fn unauthorized_mcp_response(state: &AppState, error: &str) -> Response {
    let resource_metadata = format!(
        "{}/.well-known/oauth-protected-resource/v1/mcp",
        state.server_public_base_url.trim_end_matches('/')
    );
    let mut response = (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({
            "error": error,
            "message": "Bearer access token required"
        })),
    )
        .into_response();
    response.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        HeaderValue::from_str(&format!(
            "Bearer realm=\"vibe-kanban-mcp\", error=\"{error}\", resource_metadata=\"{resource_metadata}\""
        ))
        .unwrap_or_else(|_| HeaderValue::from_static("Bearer realm=\"vibe-kanban-mcp\"")),
    );
    response
}

fn mcp_resource_uri(state: &AppState) -> String {
    format!(
        "{}/v1/mcp",
        state.server_public_base_url.trim_end_matches('/')
    )
}
