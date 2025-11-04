use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::headers::{Authorization, HeaderMapExt, authorization::Bearer};
use utils::clerk::ClerkIdentity;

use crate::{
    AppState, configure_user_scope,
    db::identity::{IdentityError, IdentityRepository, Organization, User},
};

#[derive(Clone)]
pub struct RequestContext {
    pub organization: Organization,
    pub user: User,
    pub identity: ClerkIdentity,
}

pub async fn require_clerk_session(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let bearer = match req.headers().typed_get::<Authorization<Bearer>>() {
        Some(Authorization(bearer)) => bearer,
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    let auth = state.auth();
    let identity = match auth.verify(bearer.token()).await {
        Ok(identity) => identity,
        Err(err) => {
            tracing::warn!(?err, "failed to verify Clerk session");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    let org_id = match identity.org_id.clone() {
        Some(org_id) => org_id,
        None => {
            tracing::warn!("clerk session missing organization id");
            return StatusCode::FORBIDDEN.into_response();
        }
    };

    let repo = IdentityRepository::new(state.pool(), state.clerk());
    let organization = match repo
        .ensure_organization(&org_id, identity.org_slug.as_deref())
        .await
    {
        Ok(org) => org,
        Err(IdentityError::Clerk(error)) => {
            tracing::warn!(?error, "clerk organization lookup failed");
            return StatusCode::FORBIDDEN.into_response();
        }
        Err(IdentityError::Database(error)) => {
            tracing::error!(?error, "failed to ensure organization");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let user = match repo.ensure_user(&org_id, &identity.user_id).await {
        Ok(user) => user,
        Err(IdentityError::Clerk(error)) => {
            tracing::warn!(?error, "clerk user lookup failed");
            return StatusCode::FORBIDDEN.into_response();
        }
        Err(IdentityError::Database(error)) => {
            tracing::error!(?error, "failed to ensure user");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let _scope_guard = sentry::Hub::current().push_scope();
    configure_user_scope(
        &user.id,
        user.username.as_deref(),
        Some(user.email.as_str()),
    );

    req.extensions_mut().insert(RequestContext {
        organization,
        user,
        identity,
    });

    next.run(req).await
}
