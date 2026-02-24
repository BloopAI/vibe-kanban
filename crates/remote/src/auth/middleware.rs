use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::headers::{Authorization, HeaderMapExt, authorization::Bearer};
use chrono::{DateTime, Utc};
use tracing::warn;
use uuid::Uuid;

use api_types::User;
use crate::{
    AppState, configure_user_scope,
    db::{
        auth::{AuthSessionError, AuthSessionRepository, MAX_SESSION_INACTIVITY_DURATION},
        identity_errors::IdentityError,
        users::UserRepository,
    },
};

#[derive(Clone)]
pub struct RequestContext {
    pub user: User,
    pub session_id: Uuid,
    #[allow(dead_code)]
    pub access_token_expires_at: DateTime<Utc>,
}

pub async fn require_session(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let bearer = match req.headers().typed_get::<Authorization<Bearer>>() {
        Some(Authorization(token)) => token.token().to_owned(),
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    let ctx = match request_context_from_access_token(&state, &bearer).await {
        Ok(ctx) => ctx,
        Err(response) => return response,
    };

    req.extensions_mut().insert(ctx);
    next.run(req).await
}

pub async fn request_context_from_access_token(
    state: &AppState,
    access_token: &str,
) -> Result<RequestContext, Response> {
    let jwt = state.jwt();
    let identity = match jwt.decode_access_token(access_token) {
        Ok(details) => details,
        Err(error) => {
            warn!(?error, "failed to decode access token");
            return Err(StatusCode::UNAUTHORIZED.into_response());
        }
    };

    let mut ctx = request_context_from_auth_session_id(state, identity.session_id).await?;
    if ctx.user.id != identity.user_id {
        warn!(
            token_user_id = %identity.user_id,
            session_user_id = %ctx.user.id,
            session_id = %identity.session_id,
            "access token user does not match session user"
        );
        return Err(StatusCode::UNAUTHORIZED.into_response());
    }

    ctx.access_token_expires_at = identity.expires_at;
    Ok(ctx)
}

pub async fn request_context_from_auth_session_id(
    state: &AppState,
    session_id: Uuid,
) -> Result<RequestContext, Response> {
    let pool = state.pool();
    let session_repo = AuthSessionRepository::new(pool);
    let session = match session_repo.get(session_id).await {
        Ok(session) => session,
        Err(AuthSessionError::NotFound) => {
            warn!("session `{}` not found", session_id);
            return Err(StatusCode::UNAUTHORIZED.into_response());
        }
        Err(AuthSessionError::Database(error)) => {
            warn!(?error, "failed to load session");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
        Err(_) => {
            warn!("failed to load session for unknown reason");
            return Err(StatusCode::UNAUTHORIZED.into_response());
        }
    };

    if session.revoked_at.is_some() {
        warn!("session `{}` rejected (revoked)", session.id);
        return Err(StatusCode::UNAUTHORIZED.into_response());
    }

    if session.inactivity_duration(Utc::now()) > MAX_SESSION_INACTIVITY_DURATION {
        warn!("session `{}` expired due to inactivity; revoking", session.id);
        if let Err(error) = session_repo.revoke(session.id).await {
            warn!(?error, "failed to revoke inactive session");
        }
        return Err(StatusCode::UNAUTHORIZED.into_response());
    }

    let user_repo = UserRepository::new(pool);
    let user = match user_repo.fetch_user(session.user_id).await {
        Ok(user) => user,
        Err(IdentityError::NotFound) => {
            warn!("user `{}` missing", session.user_id);
            return Err(StatusCode::UNAUTHORIZED.into_response());
        }
        Err(IdentityError::Database(error)) => {
            warn!(?error, "failed to load user");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
        Err(_) => {
            warn!("unexpected error loading user");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    configure_user_scope(user.id, user.username.as_deref(), Some(user.email.as_str()));

    let ctx = RequestContext {
        user,
        session_id: session.id,
        access_token_expires_at: Utc::now(),
    };

    match session_repo.touch(session.id).await {
        Ok(_) => {}
        Err(error) => warn!(?error, "failed to update session last-used timestamp"),
    }

    Ok(ctx)
}
