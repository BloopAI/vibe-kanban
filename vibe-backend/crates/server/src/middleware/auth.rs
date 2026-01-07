use axum::{
    extract::{FromRequestParts, Request, State},
    http::{header::AUTHORIZATION, request::Parts, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;
use utils::response::ApiResponse;

/// Authenticated user extracted from Clerk JWT
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClerkUser {
    pub user_id: String,
    pub email: Option<String>,
    pub session_id: Option<String>,
}

/// JWT claims from Clerk token
#[derive(Debug, Deserialize)]
struct ClerkClaims {
    sub: String, // user_id
    sid: Option<String>, // session_id
    email: Option<String>,
    azp: Option<String>, // authorized party (client ID)
    exp: u64,
    iat: u64,
    iss: String,
}

/// Cached JWKS with expiration
struct CachedJwks {
    jwks: JwkSet,
    fetched_at: Instant,
}

/// Auth state for the middleware
pub struct AuthState {
    http_client: Client,
    jwks_cache: RwLock<Option<CachedJwks>>,
    clerk_issuer: String,
    jwks_url: String,
    cache_duration: Duration,
}

impl AuthState {
    pub fn new() -> Self {
        // Clerk issuer format: https://<clerk-subdomain>.clerk.accounts.dev
        // We'll extract this from the token itself or use env var
        let clerk_domain = std::env::var("CLERK_DOMAIN")
            .unwrap_or_else(|_| "clerk.accounts.dev".to_string());

        Self {
            http_client: Client::new(),
            jwks_cache: RwLock::new(None),
            clerk_issuer: format!("https://{}", clerk_domain),
            jwks_url: format!("https://{}/.well-known/jwks.json", clerk_domain),
            cache_duration: Duration::from_secs(3600), // 1 hour cache
        }
    }

    /// Fetch JWKS from Clerk, with caching
    async fn get_jwks(&self) -> Result<JwkSet, AuthError> {
        // Check cache first
        {
            let cache = self.jwks_cache.read().await;
            if let Some(cached) = cache.as_ref() {
                if cached.fetched_at.elapsed() < self.cache_duration {
                    return Ok(cached.jwks.clone());
                }
            }
        }

        // Fetch fresh JWKS
        let response = self
            .http_client
            .get(&self.jwks_url)
            .send()
            .await
            .map_err(|e| {
                tracing::error!("Failed to fetch JWKS: {}", e);
                AuthError::JwksFetchFailed
            })?;

        let jwks: JwkSet = response.json().await.map_err(|e| {
            tracing::error!("Failed to parse JWKS: {}", e);
            AuthError::JwksParseFailed
        })?;

        // Update cache
        {
            let mut cache = self.jwks_cache.write().await;
            *cache = Some(CachedJwks {
                jwks: jwks.clone(),
                fetched_at: Instant::now(),
            });
        }

        Ok(jwks)
    }

    /// Validate a JWT token and extract claims
    async fn validate_token(&self, token: &str) -> Result<ClerkUser, AuthError> {
        // Decode header to get the key ID (kid)
        let header = decode_header(token).map_err(|e| {
            tracing::debug!("Invalid JWT header: {}", e);
            AuthError::InvalidToken
        })?;

        let kid = header.kid.ok_or_else(|| {
            tracing::debug!("JWT missing kid");
            AuthError::InvalidToken
        })?;

        // Get JWKS and find the matching key
        let jwks = self.get_jwks().await?;
        let jwk = jwks.find(&kid).ok_or_else(|| {
            tracing::debug!("Key {} not found in JWKS", kid);
            AuthError::KeyNotFound
        })?;

        // Build decoding key from JWK
        let decoding_key = DecodingKey::from_jwk(jwk).map_err(|e| {
            tracing::error!("Failed to create decoding key: {}", e);
            AuthError::InvalidKey
        })?;

        // Set up validation
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[&self.clerk_issuer]);
        validation.validate_exp = true;

        // Decode and validate token
        let token_data = decode::<ClerkClaims>(token, &decoding_key, &validation).map_err(|e| {
            tracing::debug!("Token validation failed: {}", e);
            AuthError::InvalidToken
        })?;

        Ok(ClerkUser {
            user_id: token_data.claims.sub,
            email: token_data.claims.email,
            session_id: token_data.claims.sid,
        })
    }
}

#[derive(Debug)]
pub enum AuthError {
    MissingToken,
    InvalidToken,
    JwksFetchFailed,
    JwksParseFailed,
    KeyNotFound,
    InvalidKey,
    Expired,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AuthError::MissingToken => (StatusCode::UNAUTHORIZED, "Missing authorization token"),
            AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "Invalid authorization token"),
            AuthError::JwksFetchFailed => (StatusCode::INTERNAL_SERVER_ERROR, "Authentication service unavailable"),
            AuthError::JwksParseFailed => (StatusCode::INTERNAL_SERVER_ERROR, "Authentication configuration error"),
            AuthError::KeyNotFound => (StatusCode::UNAUTHORIZED, "Token signing key not found"),
            AuthError::InvalidKey => (StatusCode::INTERNAL_SERVER_ERROR, "Invalid signing key configuration"),
            AuthError::Expired => (StatusCode::UNAUTHORIZED, "Token has expired"),
        };

        let response = ApiResponse::<()>::error(message);
        (status, Json(response)).into_response()
    }
}

/// Extract bearer token from Authorization header
fn extract_bearer_token(auth_header: &str) -> Option<&str> {
    auth_header.strip_prefix("Bearer ").or_else(|| auth_header.strip_prefix("bearer "))
}

/// Auth middleware that validates JWT and injects ClerkUser
pub async fn auth_middleware(
    State(auth_state): State<Arc<AuthState>>,
    mut request: Request,
    next: Next,
) -> Result<Response, AuthError> {
    // Extract token from Authorization header or query parameter
    let token = match request.headers().get(AUTHORIZATION).and_then(|h| h.to_str().ok()) {
        Some(header) => extract_bearer_token(header).ok_or(AuthError::InvalidToken)?.to_string(),
        None => {
            let query = request.uri().query().unwrap_or("");
            url::form_urlencoded::parse(query.as_bytes())
                .find(|(k, _)| k == "token")
                .map(|(_, v)| v.to_string())
                .ok_or(AuthError::MissingToken)?
        }
    };

    // Validate token and get user
    let user = auth_state.validate_token(&token).await?;

    // Inject user into request extensions
    request.extensions_mut().insert(user);

    Ok(next.run(request).await)
}

/// Optional auth middleware - doesn't fail if no token, just doesn't inject user
pub async fn optional_auth_middleware(
    State(auth_state): State<Arc<AuthState>>,
    mut request: Request,
    next: Next,
) -> Response {
    if let Some(auth_header) = request.headers().get(AUTHORIZATION).and_then(|h| h.to_str().ok()) {
        if let Some(token) = extract_bearer_token(auth_header) {
            if let Ok(user) = auth_state.validate_token(token).await {
                request.extensions_mut().insert(user);
            }
        }
    }

    next.run(request).await
}

/// Extractor for ClerkUser from request extensions
impl<S> FromRequestParts<S> for ClerkUser
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        parts
            .extensions
            .get::<ClerkUser>()
            .cloned()
            .ok_or(AuthError::MissingToken)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_bearer_token() {
        assert_eq!(extract_bearer_token("Bearer abc123"), Some("abc123"));
        assert_eq!(extract_bearer_token("bearer abc123"), Some("abc123"));
        assert_eq!(extract_bearer_token("Basic abc123"), None);
        assert_eq!(extract_bearer_token("abc123"), None);
    }
}
