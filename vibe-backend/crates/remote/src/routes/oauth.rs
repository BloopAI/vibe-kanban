use std::borrow::Cow;

use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use serde::Deserialize;
use tracing::warn;
use url::Url;
use utils::api::oauth::{
    HandoffInitRequest, HandoffInitResponse, HandoffRedeemRequest, HandoffRedeemResponse,
    ProfileResponse, ProviderProfile,
};
use uuid::Uuid;

use crate::{
    AppState,
    auth::{CallbackResult, HandoffError, RequestContext},
    db::{oauth::OAuthHandoffError, oauth_accounts::OAuthAccountRepository},
};

pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/oauth/web/init", post(web_init))
        .route("/oauth/web/redeem", post(web_redeem))
        .route("/oauth/{provider}/start", get(authorize_start))
        .route("/oauth/{provider}/callback", get(authorize_callback))
}

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/profile", get(profile))
        .route("/oauth/logout", post(logout))
}

pub async fn web_init(
    State(state): State<AppState>,
    Json(payload): Json<HandoffInitRequest>,
) -> Response {
    let handoff = state.handoff();

    match handoff
        .initiate(
            &payload.provider,
            &payload.return_to,
            &payload.app_challenge,
        )
        .await
    {
        Ok(result) => (
            StatusCode::OK,
            Json(HandoffInitResponse {
                handoff_id: result.handoff_id,
                authorize_url: result.authorize_url,
            }),
        )
            .into_response(),
        Err(error) => init_error_response(error),
    }
}

pub async fn web_redeem(
    State(state): State<AppState>,
    Json(payload): Json<HandoffRedeemRequest>,
) -> Response {
    let handoff = state.handoff();

    match handoff
        .redeem(payload.handoff_id, &payload.app_code, &payload.app_verifier)
        .await
    {
        Ok(result) => (
            StatusCode::OK,
            Json(HandoffRedeemResponse {
                access_token: result.access_token,
                refresh_token: result.refresh_token,
            }),
        )
            .into_response(),
        Err(error) => redeem_error_response(error),
    }
}

#[derive(Debug, Deserialize)]
pub struct StartQuery {
    handoff_id: Uuid,
}

pub async fn authorize_start(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    Query(query): Query<StartQuery>,
) -> Response {
    let handoff = state.handoff();

    match handoff.authorize_url(&provider, query.handoff_id).await {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(error) => {
            let (status, message) = classify_handoff_error(&error);
            (
                status,
                format!("OAuth authorization failed: {}", message.into_owned()),
            )
                .into_response()
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    state: Option<String>,
    code: Option<String>,
    error: Option<String>,
}

pub async fn authorize_callback(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    Query(query): Query<CallbackQuery>,
) -> Response {
    let handoff = state.handoff();

    match handoff
        .handle_callback(
            &provider,
            query.state.as_deref(),
            query.code.as_deref(),
            query.error.as_deref(),
        )
        .await
    {
        Ok(CallbackResult::Success {
            handoff_id,
            return_to,
            app_code,
        }) => match append_query_params(&return_to, Some(handoff_id), Some(&app_code), None) {
            Ok(url) => Redirect::temporary(url.as_str()).into_response(),
            Err(err) => (
                StatusCode::BAD_REQUEST,
                format!("Invalid return_to URL: {err}"),
            )
                .into_response(),
        },
        Ok(CallbackResult::Error {
            handoff_id,
            return_to,
            error,
        }) => {
            if let Some(url) = return_to {
                match append_query_params(&url, handoff_id, None, Some(&error)) {
                    Ok(url) => Redirect::temporary(url.as_str()).into_response(),
                    Err(err) => (
                        StatusCode::BAD_REQUEST,
                        format!("Invalid return_to URL: {err}"),
                    )
                        .into_response(),
                }
            } else {
                (
                    StatusCode::BAD_REQUEST,
                    format!("OAuth authorization failed: {error}"),
                )
                    .into_response()
            }
        }
        Err(error) => {
            let (status, message) = classify_handoff_error(&error);
            (
                status,
                format!("OAuth authorization failed: {}", message.into_owned()),
            )
                .into_response()
        }
    }
}

pub async fn profile(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Json<ProfileResponse> {
    let repo = OAuthAccountRepository::new(state.pool());
    let providers = repo
        .list_by_user(ctx.user.id)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|account| ProviderProfile {
            provider: account.provider,
            username: account.username,
            display_name: account.display_name,
            email: account.email,
            avatar_url: account.avatar_url,
        })
        .collect();

    Json(ProfileResponse {
        user_id: ctx.user.id,
        username: ctx.user.username.clone(),
        email: ctx.user.email.clone(),
        providers,
    })
}

pub async fn logout(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    use crate::db::auth::{AuthSessionError, AuthSessionRepository};

    let repo = AuthSessionRepository::new(state.pool());

    match repo.revoke(ctx.session_id).await {
        Ok(_) | Err(AuthSessionError::NotFound) => StatusCode::NO_CONTENT.into_response(),
        Err(AuthSessionError::Database(error)) => {
            warn!(?error, session_id = %ctx.session_id, "failed to revoke auth session");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
        Err(error) => {
            warn!(?error, session_id = %ctx.session_id, "failed to revoke auth session");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

fn init_error_response(error: HandoffError) -> Response {
    match &error {
        HandoffError::Provider(err) => warn!(?err, "provider error during oauth init"),
        HandoffError::Database(err) => warn!(?err, "database error during oauth init"),
        HandoffError::Authorization(err) => warn!(?err, "authorization error during oauth init"),
        HandoffError::Identity(err) => warn!(?err, "identity error during oauth init"),
        HandoffError::OAuthAccount(err) => warn!(?err, "account error during oauth init"),
        _ => {}
    }

    let (status, code) = classify_handoff_error(&error);
    let code = code.into_owned();
    (status, Json(serde_json::json!({ "error": code }))).into_response()
}

fn redeem_error_response(error: HandoffError) -> Response {
    match &error {
        HandoffError::Provider(err) => warn!(?err, "provider error during oauth redeem"),
        HandoffError::Database(err) => warn!(?err, "database error during oauth redeem"),
        HandoffError::Authorization(err) => warn!(?err, "authorization error during oauth redeem"),
        HandoffError::Identity(err) => warn!(?err, "identity error during oauth redeem"),
        HandoffError::OAuthAccount(err) => warn!(?err, "account error during oauth redeem"),
        HandoffError::Session(err) => warn!(?err, "session error during oauth redeem"),
        HandoffError::Jwt(err) => warn!(?err, "jwt error during oauth redeem"),
        _ => {}
    }

    let (status, code) = classify_handoff_error(&error);
    let code = code.into_owned();

    (status, Json(serde_json::json!({ "error": code }))).into_response()
}

fn classify_handoff_error(error: &HandoffError) -> (StatusCode, Cow<'_, str>) {
    match error {
        HandoffError::UnsupportedProvider(_) => (
            StatusCode::BAD_REQUEST,
            Cow::Borrowed("unsupported_provider"),
        ),
        HandoffError::InvalidReturnUrl(_) => {
            (StatusCode::BAD_REQUEST, Cow::Borrowed("invalid_return_url"))
        }
        HandoffError::InvalidChallenge => {
            (StatusCode::BAD_REQUEST, Cow::Borrowed("invalid_challenge"))
        }
        HandoffError::NotFound => (StatusCode::NOT_FOUND, Cow::Borrowed("not_found")),
        HandoffError::Expired => (StatusCode::GONE, Cow::Borrowed("expired")),
        HandoffError::Denied => (StatusCode::FORBIDDEN, Cow::Borrowed("access_denied")),
        HandoffError::Failed(reason) => (StatusCode::BAD_REQUEST, Cow::Owned(reason.clone())),
        HandoffError::Provider(_) => (StatusCode::BAD_GATEWAY, Cow::Borrowed("provider_error")),
        HandoffError::Database(_)
        | HandoffError::Identity(_)
        | HandoffError::OAuthAccount(_)
        | HandoffError::Session(_)
        | HandoffError::Jwt(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Cow::Borrowed("internal_error"),
        ),
        HandoffError::Authorization(auth_err) => match auth_err {
            OAuthHandoffError::NotAuthorized => (StatusCode::GONE, Cow::Borrowed("not_authorized")),
            OAuthHandoffError::AlreadyRedeemed => {
                (StatusCode::GONE, Cow::Borrowed("already_redeemed"))
            }
            OAuthHandoffError::NotFound => (StatusCode::NOT_FOUND, Cow::Borrowed("not_found")),
            OAuthHandoffError::Database(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Cow::Borrowed("internal_error"),
            ),
        },
    }
}

fn append_query_params(
    base: &str,
    handoff_id: Option<Uuid>,
    app_code: Option<&str>,
    error: Option<&str>,
) -> Result<Url, url::ParseError> {
    let mut url = Url::parse(base)?;
    {
        let mut qp = url.query_pairs_mut();
        if let Some(id) = handoff_id {
            qp.append_pair("handoff_id", &id.to_string());
        }
        if let Some(code) = app_code {
            qp.append_pair("app_code", code);
        }
        if let Some(error) = error {
            qp.append_pair("error", error);
        }
    }
    Ok(url)
}
