use axum::http::HeaderMap;
use db::models::user::User;
use deployment::Deployment;
use services::services::local_session::LocalSessionService;
use uuid::Uuid;

fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    let auth_header = headers.get("Authorization")?.to_str().ok()?;

    if !auth_header.starts_with("Bearer ") {
        return None;
    }

    Some(auth_header[7..].to_string())
}

pub async fn try_get_authenticated_user<D: Deployment>(
    deployment: &D,
    headers: &HeaderMap,
) -> Option<User> {
    let session_service = LocalSessionService::from_env()?;
    let token = extract_bearer_token(headers)?;

    session_service
        .validate_token(&deployment.db().pool, &token)
        .await
        .ok()
}

pub fn get_user_id(user: &Option<User>) -> Option<Uuid> {
    user.as_ref().map(|u| u.id)
}

/// Check if the authenticated user has a valid (non-expired) Claude OAuth token.
/// Returns true if:
/// - Local auth is not configured (backward compatibility)
/// - User is not authenticated (let other middleware handle this)
/// - User has a valid token
///
/// Returns false only if user is authenticated but has no valid token.
pub async fn user_has_valid_claude_token<D: Deployment>(
    deployment: &D,
    user: &Option<User>,
) -> bool {
    // If local auth is not configured, skip this check (backward compatibility)
    if LocalSessionService::from_env().is_none() {
        return true;
    }

    // If no user is authenticated, let other middleware handle the auth error
    let user = match user {
        Some(u) => u,
        None => return true,
    };

    // Check if user has a valid token
    match deployment
        .claude_token_rotation()
        .get_user_token_status(user.id)
        .await
    {
        Ok(status) => status.has_token && !status.is_expired,
        Err(e) => {
            tracing::warn!("Failed to check Claude token status for user {}: {}", user.id, e);
            false
        }
    }
}
