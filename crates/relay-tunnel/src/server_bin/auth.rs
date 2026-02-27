use std::{collections::HashSet, sync::Arc};

use api_types::User;
use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::headers::{Authorization, HeaderMapExt, authorization::Bearer};
use chrono::{DateTime, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use tracing::warn;
use uuid::Uuid;

use super::{
    db::{
        auth_sessions::{AuthSessionError, AuthSessionRepository, MAX_SESSION_INACTIVITY_DURATION},
        identity_errors::IdentityError,
        users::UserRepository,
    },
    state::RelayAppState,
};

// ── JWT Service (decode-only subset) ──────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct AccessTokenClaims {
    pub sub: Uuid,
    pub session_id: Uuid,
    pub iat: i64,
    pub exp: i64,
    pub aud: String,
}

#[derive(Debug, Clone)]
pub struct AccessTokenDetails {
    pub user_id: Uuid,
    pub session_id: Uuid,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, thiserror::Error)]
pub enum JwtError {
    #[error("invalid token")]
    InvalidToken,
    #[error("invalid jwt secret")]
    InvalidSecret,
    #[error(transparent)]
    Jwt(#[from] jsonwebtoken::errors::Error),
}

const DEFAULT_JWT_LEEWAY_SECONDS: u64 = 60;

#[derive(Clone)]
pub struct JwtService {
    pub secret: Arc<SecretString>,
}

impl std::fmt::Debug for JwtService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("JwtService")
            .field("secret", &"[REDACTED]")
            .finish()
    }
}

impl JwtService {
    pub fn new(secret: SecretString) -> Self {
        Self {
            secret: Arc::new(secret),
        }
    }

    pub fn decode_access_token(&self, token: &str) -> Result<AccessTokenDetails, JwtError> {
        if token.trim().is_empty() {
            return Err(JwtError::InvalidToken);
        }

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        validation.validate_nbf = false;
        validation.set_audience(&["access"]);
        validation.required_spec_claims =
            HashSet::from(["sub".to_string(), "exp".to_string(), "aud".to_string()]);
        validation.leeway = DEFAULT_JWT_LEEWAY_SECONDS;

        let decoding_key = DecodingKey::from_base64_secret(self.secret.expose_secret())?;
        let data = decode::<AccessTokenClaims>(token, &decoding_key, &validation)?;
        let claims = data.claims;
        let expires_at = DateTime::from_timestamp(claims.exp, 0).ok_or(JwtError::InvalidToken)?;

        Ok(AccessTokenDetails {
            user_id: claims.sub,
            session_id: claims.session_id,
            expires_at,
        })
    }
}

// ── Request Context ───────────────────────────────────────────────────

#[derive(Clone)]
pub struct RequestContext {
    pub user: User,
    pub session_id: Uuid,
    #[allow(dead_code)]
    pub access_token_expires_at: DateTime<Utc>,
}

// ── Auth Middleware ───────────────────────────────────────────────────

pub async fn require_session(
    State(state): State<RelayAppState>,
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

async fn request_context_from_access_token(
    state: &RelayAppState,
    access_token: &str,
) -> Result<RequestContext, Response> {
    let identity = match state.jwt.decode_access_token(access_token) {
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
    state: &RelayAppState,
    session_id: Uuid,
) -> Result<RequestContext, Response> {
    let pool = &state.pool;
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
    };

    if session.revoked_at.is_some() {
        warn!("session `{}` rejected (revoked)", session.id);
        return Err(StatusCode::UNAUTHORIZED.into_response());
    }

    if session.inactivity_duration(Utc::now()) > MAX_SESSION_INACTIVITY_DURATION {
        warn!(
            "session `{}` expired due to inactivity; revoking",
            session.id
        );
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
