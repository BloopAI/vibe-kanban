use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::headers::{Authorization, HeaderMapExt, authorization::Bearer};
use tracing::warn;
use uuid::Uuid;

use crate::{
    AppState, configure_user_scope,
    db::{
        auth::{AuthSessionError, AuthSessionRepository},
        identity_errors::IdentityError,
        organizations::{Organization, OrganizationRepository},
        users::{User, UserRepository},
    },
};

#[derive(Clone)]
pub struct RequestContext {
    pub organization: Organization,
    pub user: User,
    pub session_id: Uuid,
    pub session_secret: String,
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

    let jwt = state.jwt();
    let identity = match jwt.decode(&bearer) {
        Ok(identity) => identity,
        Err(error) => {
            warn!(?error, "failed to decode session token");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    let pool = state.pool();
    let session_repo = AuthSessionRepository::new(pool);
    let session = match session_repo.get(identity.session_id).await {
        Ok(session) => session,
        Err(AuthSessionError::NotFound) => {
            warn!("session `{}` not found", identity.session_id);
            return StatusCode::UNAUTHORIZED.into_response();
        }
        Err(AuthSessionError::Database(error)) => {
            warn!(?error, "failed to load session");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if session.revoked_at.is_some() || session.session_secret != identity.nonce {
        warn!(
            "session `{}` rejected (revoked or rotated)",
            identity.session_id
        );
        return StatusCode::UNAUTHORIZED.into_response();
    }

    let org_repo = OrganizationRepository::new(pool);
    let organization = match org_repo.fetch_organization(identity.org_id).await {
        Ok(org) => org,
        Err(IdentityError::NotFound) => {
            warn!("organization `{}` missing", identity.org_id);
            return StatusCode::FORBIDDEN.into_response();
        }
        Err(IdentityError::Database(error)) => {
            warn!(?error, "failed to load organization");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
        Err(_) => {
            warn!("unexpected error loading organization");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let user_repo = UserRepository::new(pool);
    let user = match user_repo.fetch_user(identity.user_id).await {
        Ok(user) => user,
        Err(IdentityError::NotFound) => {
            warn!("user `{}` missing", identity.user_id);
            return StatusCode::UNAUTHORIZED.into_response();
        }
        Err(IdentityError::Database(error)) => {
            warn!(?error, "failed to load user");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
        Err(_) => {
            warn!("unexpected error loading user");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    configure_user_scope(user.id, user.username.as_deref(), Some(user.email.as_str()));

    req.extensions_mut().insert(RequestContext {
        organization,
        user,
        session_id: session.id,
        session_secret: session.session_secret.clone(),
    });

    match session_repo.touch(session.id).await {
        Ok(_) => {}
        Err(error) => warn!(?error, "failed to update session last-used timestamp"),
    }

    next.run(req).await
}
