use std::convert::Infallible;

use axum::{
    body::Body,
    extract::{FromRequestParts, State},
    http::{Request, StatusCode, Uri, request::Parts},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::headers::{Authorization, HeaderMapExt, authorization::Bearer};
use deployment::Deployment;
use services::services::clerk::ClerkSession;
use tracing::warn;
use url::form_urlencoded;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Clone, Debug)]
pub struct ClerkSessionMaybe(pub Option<ClerkSession>);

impl ClerkSessionMaybe {
    pub fn as_ref(&self) -> Option<&ClerkSession> {
        self.0.as_ref()
    }

    pub fn into_option(self) -> Option<ClerkSession> {
        self.0
    }

    pub fn require(&self) -> Result<&ClerkSession, ApiError> {
        self.0.as_ref().ok_or(ApiError::Unauthorized)
    }
}

impl<S> FromRequestParts<S> for ClerkSessionMaybe
where
    S: Send + Sync,
{
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let session = parts.extensions.get::<ClerkSession>().cloned();
        Ok(Self(session))
    }
}

pub async fn require_clerk_session(
    State(deployment): State<DeploymentImpl>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let Some(auth) = deployment.clerk_auth() else {
        warn!("Clerk authentication is not configured; rejecting request");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };

    let token = match extract_token(req.headers(), req.uri()) {
        Some(token) => token,
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    let identity = match auth.verify(&token).await {
        Ok(identity) => identity,
        Err(err) => {
            warn!(?err, "failed to verify Clerk session");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    let session = ClerkSession::from_parts(token, identity);
    deployment.clerk_sessions().set(session.clone()).await;
    req.extensions_mut().insert(session);

    next.run(req).await
}

fn extract_token(headers: &axum::http::HeaderMap, uri: &Uri) -> Option<String> {
    if let Some(Authorization(bearer)) = headers.typed_get::<Authorization<Bearer>>() {
        return Some(bearer.token().to_owned());
    }
    if let Some(header) = headers.get("X-Clerk-Token") {
        if let Ok(value) = header.to_str() {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_owned());
            }
        }
    }
    query_token(uri)
}

fn query_token(uri: &Uri) -> Option<String> {
    let Some(query) = uri.query() else {
        return None;
    };

    form_urlencoded::parse(query.as_bytes()).find_map(|(key, value)| match key.as_ref() {
        "token" | "clerk_token" => {
            let trimmed = value.trim();
            (!trimmed.is_empty()).then_some(trimmed.to_owned())
        }
        _ => None,
    })
}
