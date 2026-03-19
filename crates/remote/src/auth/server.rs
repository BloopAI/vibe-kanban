use std::collections::HashSet;

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect, Response},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use url::Url;
use uuid::Uuid;

use crate::{
    AppState,
    auth::{
        ACCESS_TOKEN_TTL_SECONDS, HandoffError, JwtError, JwtService, TokenRefreshError,
        refresh_user_tokens,
    },
    db::oauth::OAuthHandoffError,
};

const AUTH_CODE_TTL_MINUTES: i64 = 5;

#[derive(Debug, Clone, Copy)]
pub struct OAuthServerPolicy {
    pub client_id_audience: &'static str,
    pub auth_code_audience: &'static str,
    pub authorization_endpoint_path: &'static str,
    pub token_endpoint_path: &'static str,
    pub registration_endpoint_path: &'static str,
    pub callback_path: &'static str,
}

#[derive(Debug, Serialize)]
pub struct AuthorizationServerMetadata {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    registration_endpoint: String,
    response_types_supported: Vec<&'static str>,
    grant_types_supported: Vec<&'static str>,
    code_challenge_methods_supported: Vec<&'static str>,
    token_endpoint_auth_methods_supported: Vec<&'static str>,
}

pub async fn authorization_server_metadata(
    State(state): State<AppState>,
    policy: OAuthServerPolicy,
) -> Json<AuthorizationServerMetadata> {
    let base = state.server_public_base_url.trim_end_matches('/');

    Json(AuthorizationServerMetadata {
        issuer: base.to_string(),
        authorization_endpoint: format!("{base}{}", policy.authorization_endpoint_path),
        token_endpoint: format!("{base}{}", policy.token_endpoint_path),
        registration_endpoint: format!("{base}{}", policy.registration_endpoint_path),
        response_types_supported: vec!["code"],
        grant_types_supported: vec!["authorization_code", "refresh_token"],
        code_challenge_methods_supported: vec!["S256"],
        token_endpoint_auth_methods_supported: vec!["none"],
    })
}

#[derive(Debug, Deserialize)]
pub struct RegisterClientRequest {
    redirect_uris: Vec<String>,
    grant_types: Option<Vec<String>>,
    response_types: Option<Vec<String>>,
    token_endpoint_auth_method: Option<String>,
    client_name: Option<String>,
}

#[derive(Debug, Serialize)]
struct RegisterClientResponse {
    client_id: String,
    client_id_issued_at: i64,
    redirect_uris: Vec<String>,
    grant_types: Vec<String>,
    response_types: Vec<String>,
    token_endpoint_auth_method: String,
    client_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ClientRegistrationClaims {
    aud: String,
    iat: i64,
    exp: i64,
    redirect_uris: Vec<String>,
    token_endpoint_auth_method: String,
    client_name: Option<String>,
}

pub async fn register_client(
    State(state): State<AppState>,
    policy: OAuthServerPolicy,
    Json(payload): Json<RegisterClientRequest>,
) -> Response {
    let jwt = state.jwt();
    if payload.redirect_uris.is_empty() {
        return oauth_error_response(
            StatusCode::BAD_REQUEST,
            "invalid_client_metadata",
            Some("redirect_uris must contain at least one URI"),
        );
    }

    let mut normalized_redirect_uris = Vec::with_capacity(payload.redirect_uris.len());
    let mut seen = HashSet::new();
    for redirect_uri in payload.redirect_uris {
        let parsed = match Url::parse(&redirect_uri) {
            Ok(url) => url,
            Err(_) => {
                return oauth_error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_redirect_uri",
                    Some("redirect_uris must contain valid absolute URLs"),
                );
            }
        };
        let normalized = parsed.to_string();
        if !seen.insert(normalized.clone()) {
            continue;
        }
        normalized_redirect_uris.push(normalized);
    }

    if let Some(method) = payload.token_endpoint_auth_method.as_deref()
        && method != "none"
    {
        return oauth_error_response(
            StatusCode::BAD_REQUEST,
            "invalid_client_metadata",
            Some("Only token_endpoint_auth_method=none is supported"),
        );
    }

    if let Some(grant_types) = payload.grant_types.as_ref() {
        let supported = grant_types
            .iter()
            .all(|grant| matches!(grant.as_str(), "authorization_code" | "refresh_token"));
        if !supported {
            return oauth_error_response(
                StatusCode::BAD_REQUEST,
                "invalid_client_metadata",
                Some("Only authorization_code and refresh_token grant types are supported"),
            );
        }
    }

    if let Some(response_types) = payload.response_types.as_ref()
        && !response_types
            .iter()
            .all(|response_type| response_type == "code")
    {
        return oauth_error_response(
            StatusCode::BAD_REQUEST,
            "invalid_client_metadata",
            Some("Only response_type=code is supported"),
        );
    }

    let now = Utc::now();
    let claims = ClientRegistrationClaims {
        aud: policy.client_id_audience.to_string(),
        iat: now.timestamp(),
        exp: (now + Duration::days(3650)).timestamp(),
        redirect_uris: normalized_redirect_uris.clone(),
        token_endpoint_auth_method: "none".to_string(),
        client_name: payload.client_name.clone(),
    };

    let client_id = match jwt.sign_claims(&claims) {
        Ok(value) => value,
        Err(error) => {
            warn!(?error, "failed to sign OAuth client registration");
            return oauth_error_response(StatusCode::INTERNAL_SERVER_ERROR, "server_error", None);
        }
    };

    (
        StatusCode::CREATED,
        Json(RegisterClientResponse {
            client_id,
            client_id_issued_at: now.timestamp(),
            redirect_uris: normalized_redirect_uris,
            grant_types: vec![
                "authorization_code".to_string(),
                "refresh_token".to_string(),
            ],
            response_types: vec!["code".to_string()],
            token_endpoint_auth_method: "none".to_string(),
            client_name: payload.client_name,
        }),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
pub struct AuthorizeQuery {
    response_type: String,
    client_id: String,
    redirect_uri: String,
    state: Option<String>,
    code_challenge: String,
    code_challenge_method: Option<String>,
    provider: Option<String>,
    resource: Option<String>,
}

pub async fn authorize(
    State(state): State<AppState>,
    policy: OAuthServerPolicy,
    uri: axum::http::Uri,
    Query(query): Query<AuthorizeQuery>,
    resource_uri: String,
) -> Response {
    if let Some(raw_qs) = uri.query()
        && let Some(raw_cid) = raw_qs.split('&').find_map(|p| p.strip_prefix("client_id="))
    {
        let has_plus = raw_cid.contains('+');
        let has_space = raw_cid.contains(' ');
        let has_pct2b = raw_cid.contains("%2B") || raw_cid.contains("%2b");
        warn!(
            raw_client_id_len = raw_cid.len(),
            has_plus,
            has_space,
            has_pct2b,
            raw_client_id_first_40 = &raw_cid[..raw_cid.len().min(40)],
            "authorize: raw client_id from query string (diagnostic)"
        );
    }
    debug!(
        client_id_len = query.client_id.len(),
        client_id_first_20 = &query.client_id[..query.client_id.len().min(20)],
        redirect_uri = query.redirect_uri.as_str(),
        code_challenge_method = query
            .code_challenge_method
            .as_deref()
            .unwrap_or("(default S256)"),
        provider = query.provider.as_deref().unwrap_or("(auto)"),
        resource = query.resource.as_deref().unwrap_or("(none)"),
        "authorize: incoming request"
    );

    let client = match decode_client_registration(&state.jwt(), &query.client_id, policy) {
        Ok(client) => {
            debug!(
                client_name = client.client_name.as_deref().unwrap_or("(unnamed)"),
                redirect_uris = ?client.redirect_uris,
                "authorize: decoded client registration"
            );
            client
        }
        Err(error) => {
            warn!(
                ?error,
                client_id_len = query.client_id.len(),
                client_id_first_20 = &query.client_id[..query.client_id.len().min(20)],
                "failed to decode OAuth client registration"
            );
            return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_client", None);
        }
    };

    if !client
        .redirect_uris
        .iter()
        .any(|uri| uri == &query.redirect_uri)
    {
        return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_redirect_uri", None);
    }

    if query.response_type != "code" {
        return redirect_oauth_error(
            &query.redirect_uri,
            query.state.as_deref(),
            "unsupported_response_type",
        );
    }

    if query.code_challenge_method.as_deref().unwrap_or("S256") != "S256" {
        return redirect_oauth_error(
            &query.redirect_uri,
            query.state.as_deref(),
            "invalid_request",
        );
    }

    if let Some(resource) = query.resource.as_deref()
        && !is_valid_resource(resource, &resource_uri)
    {
        return redirect_oauth_error(
            &query.redirect_uri,
            query.state.as_deref(),
            "invalid_target",
        );
    }

    let provider = match select_provider(&state, query.provider.as_deref()) {
        Ok(provider) => provider,
        Err(error) => {
            return redirect_oauth_error(&query.redirect_uri, query.state.as_deref(), error);
        }
    };

    let callback_url = match build_callback_url(
        &state.server_public_base_url,
        policy.callback_path,
        &query.client_id,
        &query.redirect_uri,
        query.state.as_deref(),
        query.resource.as_deref(),
        &query.code_challenge,
    ) {
        Ok(url) => url,
        Err(_) => {
            return redirect_oauth_error(
                &query.redirect_uri,
                query.state.as_deref(),
                "invalid_request",
            );
        }
    };

    let handoff = state.handoff();
    let hex_challenge = match base64url_challenge_to_hex(&query.code_challenge) {
        Some(hex) => hex,
        None => {
            return redirect_oauth_error(
                &query.redirect_uri,
                query.state.as_deref(),
                "invalid_request",
            );
        }
    };
    match handoff
        .initiate(&provider, callback_url.as_str(), &hex_challenge)
        .await
    {
        Ok(init) => {
            debug!(
                authorize_url = init.authorize_url.as_str(),
                "authorize: redirecting to provider"
            );
            Redirect::temporary(&init.authorize_url).into_response()
        }
        Err(error) => {
            warn!(?error, provider, "authorize: handoff initiation failed");
            redirect_oauth_error(
                &query.redirect_uri,
                query.state.as_deref(),
                classify_handoff_error(&error),
            )
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct OAuthCallbackQuery {
    client_id: String,
    redirect_uri: String,
    state: Option<String>,
    resource: Option<String>,
    app_code: Option<String>,
    handoff_id: Option<Uuid>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AuthorizationCodeClaims {
    aud: String,
    client_id: String,
    redirect_uri: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resource: Option<String>,
    handoff_id: Uuid,
    app_code: String,
    iat: i64,
    exp: i64,
}

pub async fn authorize_callback(
    State(state): State<AppState>,
    policy: OAuthServerPolicy,
    Query(query): Query<OAuthCallbackQuery>,
) -> Response {
    debug!(
        client_id_len = query.client_id.len(),
        redirect_uri = query.redirect_uri.as_str(),
        handoff_id = ?query.handoff_id,
        has_error = query.error.is_some(),
        "authorize_callback: incoming request"
    );

    let jwt = state.jwt();
    if let Some(error) = query.error.as_deref() {
        return redirect_oauth_error(&query.redirect_uri, query.state.as_deref(), error);
    }

    let Some(handoff_id) = query.handoff_id else {
        return redirect_oauth_error(
            &query.redirect_uri,
            query.state.as_deref(),
            "invalid_request",
        );
    };
    let Some(app_code) = query.app_code.as_deref() else {
        return redirect_oauth_error(
            &query.redirect_uri,
            query.state.as_deref(),
            "invalid_request",
        );
    };

    let now = Utc::now();
    let claims = AuthorizationCodeClaims {
        aud: policy.auth_code_audience.to_string(),
        client_id: query.client_id.clone(),
        redirect_uri: query.redirect_uri.clone(),
        resource: query.resource.clone(),
        handoff_id,
        app_code: app_code.to_string(),
        iat: now.timestamp(),
        exp: (now + Duration::minutes(AUTH_CODE_TTL_MINUTES)).timestamp(),
    };

    let code = match jwt.sign_claims(&claims) {
        Ok(code) => code,
        Err(error) => {
            warn!(?error, "failed to sign OAuth authorization code");
            return redirect_oauth_error(
                &query.redirect_uri,
                query.state.as_deref(),
                "server_error",
            );
        }
    };

    let mut redirect = match Url::parse(&query.redirect_uri) {
        Ok(url) => url,
        Err(_) => {
            return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_redirect_uri", None);
        }
    };
    {
        let mut pairs = redirect.query_pairs_mut();
        pairs.append_pair("code", &code);
        if let Some(state) = query.state.as_deref() {
            pairs.append_pair("state", state);
        }
    }

    Redirect::temporary(redirect.as_str()).into_response()
}

#[derive(Debug, Deserialize)]
pub struct TokenRequest {
    grant_type: String,
    code: Option<String>,
    redirect_uri: Option<String>,
    client_id: Option<String>,
    code_verifier: Option<String>,
    refresh_token: Option<String>,
    resource: Option<String>,
}

#[derive(Debug, Serialize)]
struct TokenResponse {
    access_token: String,
    token_type: &'static str,
    expires_in: i64,
    refresh_token: String,
}

pub async fn token(
    State(state): State<AppState>,
    policy: OAuthServerPolicy,
    payload: TokenRequest,
    resource_uri: String,
) -> Response {
    debug!(
        grant_type = payload.grant_type.as_str(),
        has_code = payload.code.is_some(),
        has_client_id = payload.client_id.is_some(),
        has_code_verifier = payload.code_verifier.is_some(),
        has_refresh_token = payload.refresh_token.is_some(),
        resource = payload.resource.as_deref().unwrap_or("(none)"),
        "token: incoming request"
    );
    match payload.grant_type.as_str() {
        "authorization_code" => {
            exchange_authorization_code(state, policy, payload, resource_uri).await
        }
        "refresh_token" => exchange_refresh_token(state, payload, resource_uri).await,
        _ => oauth_error_response(
            StatusCode::BAD_REQUEST,
            "unsupported_grant_type",
            Some("Only authorization_code and refresh_token are supported"),
        ),
    }
}

async fn exchange_authorization_code(
    state: AppState,
    policy: OAuthServerPolicy,
    payload: TokenRequest,
    resource_uri: String,
) -> Response {
    let Some(client_id) = payload.client_id.as_deref() else {
        return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_client", None);
    };
    let Some(code) = payload.code.as_deref() else {
        return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_request", None);
    };
    let Some(redirect_uri) = payload.redirect_uri.as_deref() else {
        return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_request", None);
    };
    let Some(code_verifier) = payload.code_verifier.as_deref() else {
        return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_request", None);
    };

    let client = match decode_client_registration(&state.jwt(), client_id, policy) {
        Ok(client) => client,
        Err(error) => {
            warn!(
                ?error,
                client_id_len = client_id.len(),
                "token: failed to decode client_id"
            );
            return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_client", None);
        }
    };
    if !client.redirect_uris.iter().any(|uri| uri == redirect_uri) {
        warn!(
            redirect_uri,
            registered_uris = ?client.redirect_uris,
            "token: redirect_uri mismatch"
        );
        return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_grant", None);
    }

    let auth_code = match decode_auth_code(&state.jwt(), code, policy) {
        Ok(code) => code,
        Err(error) => {
            warn!(?error, "token: failed to decode authorization code");
            return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_grant", None);
        }
    };

    if auth_code.client_id != client_id || auth_code.redirect_uri != redirect_uri {
        warn!(
            code_client_id_matches = (auth_code.client_id == client_id),
            code_redirect_uri_matches = (auth_code.redirect_uri == redirect_uri),
            "token: auth code binding mismatch"
        );
        return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_grant", None);
    }

    if let Some(resource) = payload.resource.as_deref() {
        if !is_valid_resource(resource, &resource_uri) {
            return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_target", None);
        }
        if auth_code.resource.as_deref().is_some_and(|r| r != resource) {
            return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_grant", None);
        }
    }

    match state
        .handoff()
        .redeem(auth_code.handoff_id, &auth_code.app_code, code_verifier)
        .await
    {
        Ok(result) => (
            StatusCode::OK,
            Json(TokenResponse {
                access_token: result.access_token,
                token_type: "Bearer",
                expires_in: ACCESS_TOKEN_TTL_SECONDS,
                refresh_token: result.refresh_token,
            }),
        )
            .into_response(),
        Err(error) => {
            let oauth_error = match error {
                HandoffError::Expired => "invalid_grant",
                HandoffError::InvalidChallenge => "invalid_grant",
                HandoffError::Authorization(OAuthHandoffError::AlreadyRedeemed) => "invalid_grant",
                HandoffError::Authorization(OAuthHandoffError::NotAuthorized) => "invalid_grant",
                HandoffError::Authorization(OAuthHandoffError::NotFound) => "invalid_grant",
                HandoffError::NotFound => "invalid_grant",
                HandoffError::Denied => "access_denied",
                _ => "server_error",
            };
            oauth_error_response(
                StatusCode::BAD_REQUEST,
                oauth_error,
                Some(&error.to_string()),
            )
        }
    }
}

async fn exchange_refresh_token(
    state: AppState,
    payload: TokenRequest,
    resource_uri: String,
) -> Response {
    let Some(refresh_token) = payload.refresh_token.as_deref() else {
        return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_request", None);
    };

    if let Some(resource) = payload.resource.as_deref()
        && !is_valid_resource(resource, &resource_uri)
    {
        return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_target", None);
    }

    let tokens = match refresh_user_tokens(&state, refresh_token).await {
        Ok(tokens) => tokens,
        Err(
            TokenRefreshError::InvalidToken
            | TokenRefreshError::TokenExpired
            | TokenRefreshError::SessionRevoked
            | TokenRefreshError::TokenReuseDetected
            | TokenRefreshError::ProviderTokenRevoked
            | TokenRefreshError::Identity(_),
        ) => return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_grant", None),
        Err(TokenRefreshError::ProviderValidationUnavailable(reason)) => {
            warn!(
                reason,
                "provider validation unavailable during OAuth refresh"
            );
            return oauth_error_response(StatusCode::BAD_REQUEST, "invalid_grant", None);
        }
        Err(
            TokenRefreshError::Jwt(_)
            | TokenRefreshError::Database(_)
            | TokenRefreshError::SessionError(_),
        ) => {
            return oauth_error_response(StatusCode::INTERNAL_SERVER_ERROR, "server_error", None);
        }
    };

    (
        StatusCode::OK,
        Json(TokenResponse {
            access_token: tokens.access_token,
            token_type: "Bearer",
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            refresh_token: tokens.refresh_token,
        }),
    )
        .into_response()
}

pub fn oauth_error_response(
    status: StatusCode,
    error: &str,
    description: Option<&str>,
) -> Response {
    let mut body = serde_json::json!({ "error": error });
    if let Some(description) = description {
        body["error_description"] = serde_json::json!(description);
    }
    (status, Json(body)).into_response()
}

fn redirect_oauth_error(redirect_uri: &str, state: Option<&str>, error: &str) -> Response {
    match Url::parse(redirect_uri) {
        Ok(mut url) => {
            {
                let mut qp = url.query_pairs_mut();
                qp.append_pair("error", error);
                if let Some(state) = state {
                    qp.append_pair("state", state);
                }
            }
            Redirect::temporary(url.as_str()).into_response()
        }
        Err(_) => oauth_error_response(StatusCode::BAD_REQUEST, error, None),
    }
}

fn select_provider(
    state: &AppState,
    requested_provider: Option<&str>,
) -> Result<String, &'static str> {
    if let Some(provider) = requested_provider {
        if state.providers().get(provider).is_some() {
            return Ok(provider.to_string());
        }
        return Err("unsupported_provider");
    }

    let providers = state.providers().names();
    if providers.iter().any(|provider| provider == "github") {
        return Ok("github".to_string());
    }

    match providers.as_slice() {
        [provider] => Ok(provider.clone()),
        [] => Err("server_error"),
        _ => Err("provider_required"),
    }
}

fn build_callback_url(
    server_public_base_url: &str,
    callback_path: &str,
    client_id: &str,
    redirect_uri: &str,
    state: Option<&str>,
    resource: Option<&str>,
    code_challenge: &str,
) -> Result<Url, url::ParseError> {
    let mut callback = Url::parse(&format!(
        "{}{}",
        server_public_base_url.trim_end_matches('/'),
        callback_path
    ))?;
    {
        let mut qp = callback.query_pairs_mut();
        qp.append_pair("client_id", client_id);
        qp.append_pair("redirect_uri", redirect_uri);
        qp.append_pair("code_challenge", code_challenge);
        if let Some(state) = state {
            qp.append_pair("state", state);
        }
        if let Some(resource) = resource {
            qp.append_pair("resource", resource);
        }
    }
    Ok(callback)
}

fn decode_client_registration(
    jwt: &JwtService,
    token: &str,
    policy: OAuthServerPolicy,
) -> Result<ClientRegistrationClaims, JwtError> {
    jwt.decode_claims(token, policy.client_id_audience)
}

fn decode_auth_code(
    jwt: &JwtService,
    token: &str,
    policy: OAuthServerPolicy,
) -> Result<AuthorizationCodeClaims, JwtError> {
    jwt.decode_claims(token, policy.auth_code_audience)
}

fn classify_handoff_error(error: &HandoffError) -> &str {
    match error {
        HandoffError::UnsupportedProvider(_) => "unsupported_provider",
        HandoffError::InvalidReturnUrl(_) => "invalid_return_url",
        HandoffError::InvalidChallenge => "invalid_challenge",
        HandoffError::NotFound => "not_found",
        HandoffError::Expired => "expired",
        HandoffError::Denied => "access_denied",
        HandoffError::Provider(_) => "provider_error",
        HandoffError::Database(_)
        | HandoffError::Identity(_)
        | HandoffError::OAuthAccount(_)
        | HandoffError::Session(_)
        | HandoffError::Jwt(_) => "internal_error",
        HandoffError::Authorization(auth_err) => match auth_err {
            OAuthHandoffError::NotAuthorized => "not_authorized",
            OAuthHandoffError::AlreadyRedeemed => "already_redeemed",
            OAuthHandoffError::NotFound => "not_found",
            OAuthHandoffError::Database(_) => "internal_error",
        },
        HandoffError::Failed(_) => "server_error",
    }
}

fn is_valid_resource(resource: &str, expected: &str) -> bool {
    let normalize = |s: &str| s.trim_end_matches('/').to_lowercase();
    normalize(resource) == normalize(expected)
}

fn base64url_challenge_to_hex(b64: &str) -> Option<String> {
    let bytes = URL_SAFE_NO_PAD.decode(b64).ok()?;
    if bytes.len() != 32 {
        return None;
    }
    Some(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
