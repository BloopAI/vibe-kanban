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
