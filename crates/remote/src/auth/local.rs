use api_types::{AuthMethodsResponse, LocalLoginRequest, LocalLoginResponse};
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use secrecy::ExposeSecret;
use uuid::Uuid;

use crate::{
    AppState,
    db::{
        auth::AuthSessionRepository,
        organizations::OrganizationRepository,
        users::{UpsertUser, UserRepository},
    },
};

pub const LOCAL_AUTH_PROVIDER: &str = "local";

#[derive(Debug, thiserror::Error)]
pub enum LocalAuthError {
    #[error("not found")]
    Disabled,
    #[error("invalid credentials")]
    InvalidCredentials,
    #[error("internal error")]
    Internal,
}

pub fn auth_methods_response(state: &AppState) -> AuthMethodsResponse {
    AuthMethodsResponse {
        local_auth_enabled: state.config().auth.local().is_some(),
        oauth_providers: state.providers().names(),
    }
}

pub fn is_local_provider(provider: &str) -> bool {
    provider == LOCAL_AUTH_PROVIDER
}

pub async fn login(
    state: &AppState,
    payload: &LocalLoginRequest,
) -> Result<LocalLoginResponse, LocalAuthError> {
    let Some(local_auth) = state.config().auth.local() else {
        return Err(LocalAuthError::Disabled);
    };

    let normalized_email = local_auth.email().trim().to_ascii_lowercase();
    if payload.email.trim().to_ascii_lowercase() != normalized_email
        || payload.password != local_auth.password().expose_secret()
    {
        return Err(LocalAuthError::InvalidCredentials);
    }

    let user_repo = UserRepository::new(state.pool());
    let org_repo = OrganizationRepository::new(state.pool());
    let session_repo = AuthSessionRepository::new(state.pool());

    let existing_user = user_repo
        .fetch_user_by_email(&normalized_email)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to fetch local auth user by email");
            LocalAuthError::Internal
        })?;

    let user_id = existing_user
        .as_ref()
        .map(|user| user.id)
        .unwrap_or_else(Uuid::new_v4);
    let username = existing_user
        .as_ref()
        .and_then(|user| user.username.as_deref());

    let user = user_repo
        .upsert_user(UpsertUser {
            id: user_id,
            email: &normalized_email,
            first_name: existing_user
                .as_ref()
                .and_then(|user| user.first_name.as_deref()),
            last_name: existing_user
                .as_ref()
                .and_then(|user| user.last_name.as_deref()),
            username,
        })
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to upsert local auth user");
            LocalAuthError::Internal
        })?;

    org_repo
        .ensure_personal_org_and_admin_membership(user.id, username)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to ensure local auth personal organization");
            LocalAuthError::Internal
        })?;

    let session = session_repo.create(user.id, None).await.map_err(|error| {
        tracing::error!(?error, "failed to create local auth session");
        LocalAuthError::Internal
    })?;

    let tokens = state
        .jwt()
        .generate_tokens(&session, &user, LOCAL_AUTH_PROVIDER)
        .map_err(|error| {
            tracing::error!(?error, "failed to generate local auth tokens");
            LocalAuthError::Internal
        })?;

    session_repo
        .set_current_refresh_token(session.id, tokens.refresh_token_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to persist local auth refresh token");
            LocalAuthError::Internal
        })?;

    if let Some(analytics) = state.analytics() {
        analytics.track(
            user.id,
            "$identify",
            serde_json::json!({ "email": user.email }),
        );
    }

    Ok(LocalLoginResponse {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
    })
}

impl IntoResponse for LocalAuthError {
    fn into_response(self) -> Response {
        let (status, error) = match self {
            LocalAuthError::Disabled => (StatusCode::NOT_FOUND, "not_found"),
            LocalAuthError::InvalidCredentials => (StatusCode::UNAUTHORIZED, "invalid_credentials"),
            LocalAuthError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
        };

        (
            status,
            Json(serde_json::json!({
                "error": error,
                "message": self.to_string(),
            })),
        )
            .into_response()
    }
}
