use std::borrow::Cow;

use api_types::{
    AuthMethodsResponse, HandoffInitRequest, HandoffInitResponse, HandoffPollRequest,
    HandoffPollResponse, HandoffRedeemRequest, HandoffRedeemResponse, LocalLoginRequest,
    LocalLoginResponse, ProfileResponse, ProviderProfile,
};
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
use uuid::Uuid;

use crate::{
    AppState,
    audit::{self, AuditAction, AuditEvent},
    auth::{
        CallbackResult, HandoffError, LocalAuthError, PollResult, RequestContext,
        auth_methods_response, login as local_login_flow,
    },
    db::{oauth::OAuthHandoffError, oauth_accounts::OAuthAccountRepository},
};

pub(super) fn public_router() -> Router<AppState> {
    Router::new()
        .route("/auth/methods", get(auth_methods))
        .route("/auth/local/login", post(local_login))
        .route("/oauth/web/init", post(web_init))
        .route("/oauth/web/redeem", post(web_redeem))
        .route("/oauth/web/poll", post(web_poll))
        .route("/oauth/web/callback-success", get(callback_success))
        .route("/oauth/{provider}/start", get(authorize_start))
        .route("/oauth/{provider}/callback", get(authorize_callback))
}

async fn auth_methods(State(state): State<AppState>) -> Json<AuthMethodsResponse> {
    Json(auth_methods_response(&state))
}

pub(super) fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/profile", get(profile))
        .route("/oauth/logout", post(logout))
}

async fn web_init(
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

async fn web_redeem(
    State(state): State<AppState>,
    Json(payload): Json<HandoffRedeemRequest>,
) -> Response {
    let handoff = state.handoff();
    match handoff
        .redeem(payload.handoff_id, &payload.app_code, &payload.app_verifier)
        .await
    {
        Ok(result) => {
            if let Some(analytics) = state.analytics() {
                analytics.track(
                    result.user_id,
                    "$identify",
                    serde_json::json!({ "email": result.email }),
                );
            }

            audit::emit(
                AuditEvent::system(AuditAction::AuthLogin)
                    .user(result.user_id, None)
                    .resource("auth_session", None)
                    .http("POST", "/v1/oauth/web/redeem", 200)
                    .description("User logged in via OAuth"),
            );

            (
                StatusCode::OK,
                Json(HandoffRedeemResponse {
                    access_token: result.access_token,
                    refresh_token: result.refresh_token,
                }),
            )
                .into_response()
        }
        Err(error) => redeem_error_response(error),
    }
}

async fn web_poll(
    State(state): State<AppState>,
    Json(payload): Json<HandoffPollRequest>,
) -> Response {
    let handoff = state.handoff();
    match handoff
        .poll(payload.handoff_id, &payload.app_verifier)
        .await
    {
        Ok(PollResult::Pending) => {
            (StatusCode::OK, Json(HandoffPollResponse::Pending)).into_response()
        }
        Ok(PollResult::Complete(result)) => {
            if let Some(analytics) = state.analytics() {
                analytics.track(
                    result.user_id,
                    "$identify",
                    serde_json::json!({ "email": result.email }),
                );
            }

            audit::emit(
                AuditEvent::system(AuditAction::AuthLogin)
                    .user(result.user_id, None)
                    .resource("auth_session", None)
                    .http("POST", "/v1/oauth/web/poll", 200)
                    .description("User logged in via OAuth (desktop poll)"),
            );

            (
                StatusCode::OK,
                Json(HandoffPollResponse::Complete {
                    access_token: result.access_token,
                    refresh_token: result.refresh_token,
                }),
            )
                .into_response()
        }
        Ok(PollResult::Error(error)) => {
            (StatusCode::OK, Json(HandoffPollResponse::Error { error })).into_response()
        }
        Err(error) => redeem_error_response(error),
    }
}

async fn callback_success() -> Response {
    let body = r#"<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Authentication Complete</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #f2f2f2;
        color: #333;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        padding: 24px;
      }
      .checkmark {
        width: 48px;
        height: 48px;
        color: #22c55e;
      }
      .content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .title {
        font-size: 13px;
        font-weight: 500;
        color: #0d0d0d;
      }
      .subtitle {
        font-size: 12px;
        color: #636363;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <svg class="checkmark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      <div class="content">
        <p class="title">Authentication complete</p>
        <p class="subtitle">You can close this tab and return to the app.</p>
      </div>
    </div>
  </body>
</html>"#;

    axum::response::Html(body).into_response()
}

async fn local_login(
    State(state): State<AppState>,
    Json(payload): Json<LocalLoginRequest>,
) -> Result<Json<LocalLoginResponse>, LocalAuthError> {
    let response = local_login_flow(&state, &payload).await?;
    Ok(Json(response))
}

#[derive(Debug, Deserialize)]
struct StartQuery {
    handoff_id: Uuid,
}

async fn authorize_start(
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
struct CallbackQuery {
    state: Option<String>,
    code: Option<String>,
    error: Option<String>,
}

async fn authorize_callback(
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

async fn profile(
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

async fn logout(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    use crate::db::auth::{AuthSessionError, AuthSessionRepository};

    let repo = AuthSessionRepository::new(state.pool());

    let (response, status) = match repo.revoke(ctx.session_id).await {
        Ok(_) | Err(AuthSessionError::NotFound) => (StatusCode::NO_CONTENT.into_response(), 204u16),
        Err(AuthSessionError::Database(error)) => {
            warn!(?error, session_id = %ctx.session_id, "failed to revoke auth session");
            (StatusCode::INTERNAL_SERVER_ERROR.into_response(), 500u16)
        }
        Err(error) => {
            warn!(?error, session_id = %ctx.session_id, "failed to revoke auth session");
            (StatusCode::INTERNAL_SERVER_ERROR.into_response(), 500u16)
        }
    };

    audit::emit(
        AuditEvent::from_request(&ctx, AuditAction::AuthLogout)
            .resource("auth_session", Some(ctx.session_id))
            .http("POST", "/v1/oauth/logout", status)
            .description("User logged out"),
    );

    response
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
