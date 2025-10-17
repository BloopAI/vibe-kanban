use std::convert::Infallible;

use axum::{extract::FromRequestParts, http::request::Parts};
use services::services::clerk::ClerkSession;

use crate::error::ApiError;

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
