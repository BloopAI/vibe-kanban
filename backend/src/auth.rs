use std::collections::HashSet;

use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
    http::{HeaderMap, StatusCode},
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::app_state::AppState;

#[derive(Debug, Serialize, Deserialize, Clone, TS, ToSchema)]
#[ts(export)]
pub struct Claims {
    pub sub: String,      // Subject (user ID)
    pub username: String, // GitHub username
    pub email: String,    // Primary email
    pub github_id: i64,   // GitHub user ID
    pub exp: usize,       // Expiration time
    pub iat: usize,       // Issued at
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, ToSchema)]
#[ts(export)]
pub struct AuthUser {
    pub id: Uuid,
    pub github_id: i64,
    pub username: String,
    pub email: String,
}

/// JWT secret key for signing tokens
fn get_jwt_secret() -> Vec<u8> {
    std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "your-secret-key-change-in-production".to_string())
        .into_bytes()
}

/// Generate a JWT token for a user
pub fn generate_jwt_token(
    user_id: Uuid,
    github_id: i64,
    username: &str,
    email: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now();
    let expiration = now + chrono::Duration::hours(24); // Token expires in 24 hours

    let claims = Claims {
        sub: user_id.to_string(),
        username: username.to_string(),
        email: email.to_string(),
        github_id,
        exp: expiration.timestamp() as usize,
        iat: now.timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(&get_jwt_secret()),
    )
}

/// Validate a JWT token and extract claims
pub fn validate_jwt_token(token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let mut validation = Validation::default();
    validation.validate_exp = true;

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(&get_jwt_secret()),
        &validation,
    )
    .map(|token_data| token_data.claims)
}

/// Extract JWT token from Authorization header
fn extract_token_from_header(headers: &HeaderMap) -> Option<String> {
    headers
        .get("Authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|auth_header| {
            if auth_header.starts_with("Bearer ") {
                Some(auth_header[7..].to_string())
            } else {
                None
            }
        })
}

/// Check if user is in whitelist (if whitelist is configured)
pub fn is_user_whitelisted(username: &str) -> bool {
    if let Ok(whitelist_str) = std::env::var("GITHUB_USER_WHITELIST") {
        if whitelist_str.trim().is_empty() {
            return true; // Empty whitelist means all users allowed
        }
        
        let whitelist: HashSet<String> = whitelist_str
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .collect();
        
        whitelist.contains(&username.to_lowercase())
    } else {
        true // No whitelist configured means all users allowed
    }
}

/// Middleware to require authentication
pub async fn auth_middleware(
    State(_app_state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let headers = req.headers();
    
    if let Some(token) = extract_token_from_header(headers) {
        match validate_jwt_token(&token) {
            Ok(claims) => {
                // Create AuthUser from claims
                let auth_user = AuthUser {
                    id: Uuid::parse_str(&claims.sub).map_err(|_| StatusCode::UNAUTHORIZED)?,
                    github_id: claims.github_id,
                    username: claims.username,
                    email: claims.email,
                };
                
                // Add user to request extensions
                req.extensions_mut().insert(auth_user);
                Ok(next.run(req).await)
            }
            Err(_) => Err(StatusCode::UNAUTHORIZED),
        }
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}


/// Helper to extract authenticated user from request
pub fn get_auth_user(req: &Request) -> Option<&AuthUser> {
    req.extensions().get::<AuthUser>()
}

#[derive(Serialize, Deserialize, TS, ToSchema)]
#[ts(export)]
pub struct LoginResponse {
    pub token: String,
    pub user: AuthUser,
}

#[derive(Serialize, Deserialize, TS, ToSchema)]
#[ts(export)]
pub struct UserInfoResponse {
    pub user: AuthUser,
}

mod tests;