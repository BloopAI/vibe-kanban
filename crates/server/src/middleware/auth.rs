use axum::http::HeaderMap;
use db::models::user::User;
use deployment::Deployment;
use services::services::local_session::LocalSessionService;
use uuid::Uuid;

/// Extract a bearer token from the Authorization header
fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    let auth_header = headers.get("Authorization")?.to_str().ok()?;

    if !auth_header.starts_with("Bearer ") {
        return None;
    }

    Some(auth_header[7..].to_string())
}

/// Try to validate the token and get the user from a request.
/// Returns None if:
/// - No Authorization header present
/// - Session service not configured (auth not enabled)
/// - Token is invalid or expired
pub async fn try_get_authenticated_user<D: Deployment>(
    deployment: &D,
    headers: &HeaderMap,
) -> Option<User> {
    let session_service = LocalSessionService::from_env()?;
    let token = extract_bearer_token(headers)?;
    let pool = &deployment.db().pool;

    session_service.validate_token(pool, &token).await.ok()
}

/// Get the user ID from an optional user
pub fn get_user_id(user: &Option<User>) -> Option<Uuid> {
    user.as_ref().map(|u| u.id)
}
