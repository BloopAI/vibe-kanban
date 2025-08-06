use axum::{
    extract::{Request, State},
    middleware::Next,
    response::{Json as ResponseJson, Response},
    routing::{get, post},
    Json, Router,
};
use ts_rs::TS;
use utoipa::ToSchema;

use crate::{
    app_state::AppState,
    models::{user::User, ApiResponse}
};

// Import auth functionality directly (temporary fix for import issues)
use crate::auth::{
    generate_jwt_token, is_user_whitelisted, AuthUser, LoginResponse, UserInfoResponse, get_auth_user
};

pub fn auth_router() -> Router<AppState> {
    Router::new()
        // Legacy single-user routes (backward compatibility)
        .route("/auth/github/device/start", post(device_start))
        .route("/auth/github/device/poll", post(device_poll))
        .route("/auth/github/check", get(github_check_token))
        .route("/auth/logout", post(logout))
        // New multiuser routes (same handlers, different paths)
        .route("/auth/multiuser/github/device/start", post(device_start))
        .route("/auth/multiuser/github/device/poll", post(device_poll))
}

pub fn protected_auth_router() -> Router<AppState> {
    Router::new()
        .route("/auth/user/info", get(user_info))
        .route("/auth/users", get(list_users))
}

#[derive(serde::Deserialize, ToSchema)]
struct DeviceStartRequest {}

#[derive(serde::Serialize, TS, ToSchema)]
#[ts(export)]
pub struct DeviceStartResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub interval: u32,
}

#[derive(serde::Deserialize, ToSchema)]
pub struct DevicePollRequest {
    device_code: String,
}

/// POST /auth/github/device/start OR /auth/multiuser/github/device/start
#[utoipa::path(
    post,
    path = "/auth/github/device/start",
    tag = "auth",
    summary = "Start GitHub OAuth device flow",
    description = "Initiates GitHub OAuth device authorization flow, returning device and user codes. Available at both legacy and multiuser endpoints.",
    responses(
        (status = 200, description = "Device authorization flow started successfully", body = ApiResponse<DeviceStartResponse>),
        (status = 500, description = "Failed to contact GitHub or parse response", body = ApiResponse<String>)
    )
)]
pub async fn device_start() -> ResponseJson<ApiResponse<DeviceStartResponse>> {
    let client_id = std::env::var("GITHUB_CLIENT_ID").unwrap_or_else(|_| "Ov23li2nd1KF5nCPbgoj".to_string());

    let params = [("client_id", client_id.as_str()), ("scope", "user:email,repo")];
    let client = reqwest::Client::new();
    let res = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .await;
    let res = match res {
        Ok(r) => r,
        Err(e) => {
            return ResponseJson(ApiResponse::error(&format!(
                "Failed to contact GitHub: {e}"
            )));
        }
    };
    let json: serde_json::Value = match res.json().await {
        Ok(j) => j,
        Err(e) => {
            return ResponseJson(ApiResponse::error(&format!(
                "Failed to parse GitHub response: {e}"
            )));
        }
    };
    if let (
        Some(device_code),
        Some(user_code),
        Some(verification_uri),
        Some(expires_in),
        Some(interval),
    ) = (
        json.get("device_code").and_then(|v| v.as_str()),
        json.get("user_code").and_then(|v| v.as_str()),
        json.get("verification_uri").and_then(|v| v.as_str()),
        json.get("expires_in").and_then(|v| v.as_u64()),
        json.get("interval").and_then(|v| v.as_u64()),
    ) {
        ResponseJson(ApiResponse::success(DeviceStartResponse {
            device_code: device_code.to_string(),
            user_code: user_code.to_string(),
            verification_uri: verification_uri.to_string(),
            expires_in: expires_in.try_into().unwrap_or(600),
            interval: interval.try_into().unwrap_or(5),
        }))
    } else {
        ResponseJson(ApiResponse::error(&format!("GitHub error: {}", json)))
    }
}

/// POST /auth/github/device/poll OR /auth/multiuser/github/device/poll
#[utoipa::path(
    post,
    path = "/auth/github/device/poll",
    tag = "auth",
    summary = "Poll GitHub OAuth device flow",
    description = "Polls GitHub for OAuth device flow completion, creates/updates user, and returns JWT token. Available at both legacy and multiuser endpoints.",
    request_body = DevicePollRequest,
    responses(
        (status = 200, description = "GitHub login successful with JWT token", body = ApiResponse<LoginResponse>),
        (status = 400, description = "OAuth error, invalid device code, or user not whitelisted", body = ApiResponse<String>),
        (status = 403, description = "User not whitelisted", body = ApiResponse<String>)
    )
)]
pub async fn device_poll(
    State(app_state): State<AppState>,
    Json(payload): Json<DevicePollRequest>,
) -> ResponseJson<ApiResponse<LoginResponse>> {
    let client_id = std::env::var("GITHUB_CLIENT_ID").unwrap_or_else(|_| "Ov23li2nd1KF5nCPbgoj".to_string());

    let params = [
        ("client_id", client_id.as_str()),
        ("device_code", payload.device_code.as_str()),
        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
    ];
    let client = reqwest::Client::new();
    let res = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .await;
    let res = match res {
        Ok(r) => r,
        Err(e) => {
            return ResponseJson(ApiResponse::error(&format!(
                "Failed to contact GitHub: {e}"
            )));
        }
    };
    let json: serde_json::Value = match res.json().await {
        Ok(j) => j,
        Err(e) => {
            return ResponseJson(ApiResponse::error(&format!(
                "Failed to parse GitHub response: {e}"
            )));
        }
    };
    if let Some(error) = json.get("error").and_then(|v| v.as_str()) {
        // Not authorized yet, or other error
        return ResponseJson(ApiResponse::error(error));
    }
    
    let access_token = json.get("access_token").and_then(|v| v.as_str());
    if let Some(access_token) = access_token {
        // Fetch user info
        let user_res = client
            .get("https://api.github.com/user")
            .bearer_auth(access_token)
            .header("User-Agent", "automagik-forge-app")
            .send()
            .await;
        let user_json: serde_json::Value = match user_res {
            Ok(res) => match res.json().await {
                Ok(json) => json,
                Err(e) => {
                    return ResponseJson(ApiResponse::error(&format!(
                        "Failed to parse GitHub user response: {e}"
                    )));
                }
            },
            Err(e) => {
                return ResponseJson(ApiResponse::error(&format!(
                    "Failed to fetch user info: {e}"
                )));
            }
        };
        
        let github_id = user_json.get("id").and_then(|v| v.as_i64());
        let username = user_json.get("login").and_then(|v| v.as_str());
        
        if github_id.is_none() || username.is_none() {
            return ResponseJson(ApiResponse::error("Invalid GitHub user data"));
        }
        
        let github_id = github_id.unwrap();
        let username = username.unwrap();
        
        // Check if user is whitelisted
        if !is_user_whitelisted(username) {
            return ResponseJson(ApiResponse::error("User not whitelisted for this application"));
        }
        
        // Fetch user emails
        let emails_res = client
            .get("https://api.github.com/user/emails")
            .bearer_auth(access_token)
            .header("User-Agent", "automagik-forge-app")
            .send()
            .await;
        let emails_json: serde_json::Value = match emails_res {
            Ok(res) => match res.json().await {
                Ok(json) => json,
                Err(e) => {
                    return ResponseJson(ApiResponse::error(&format!(
                        "Failed to parse GitHub emails response: {e}"
                    )));
                }
            },
            Err(e) => {
                return ResponseJson(ApiResponse::error(&format!(
                    "Failed to fetch user emails: {e}"
                )));
            }
        };
        
        let primary_email = emails_json
            .as_array()
            .and_then(|arr| {
                arr.iter()
                    .find(|email| {
                        email
                            .get("primary")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false)
                    })
                    .and_then(|email| email.get("email").and_then(|v| v.as_str()))
            })
            .unwrap_or(username); // Fallback to username if no primary email found

        // Create or update user in database
        let user = match User::create_or_update_from_github(
            &app_state.db_pool,
            github_id,
            username.to_string(),
            primary_email.to_string(),
            Some(access_token.to_string()),
        ).await {
            Ok(user) => user,
            Err(e) => {
                tracing::error!("Failed to create/update user: {}", e);
                return ResponseJson(ApiResponse::error("Failed to create user"));
            }
        };

        // Generate JWT token
        let token = match generate_jwt_token(user.id, user.github_id, &user.username, &user.email) {
            Ok(token) => token,
            Err(e) => {
                tracing::error!("Failed to generate JWT token: {}", e);
                return ResponseJson(ApiResponse::error("Failed to generate authentication token"));
            }
        };

        // Also save to config for backward compatibility
        {
            let mut config = app_state.get_config().write().await;
            config.github.username = Some(user.username.clone());
            config.github.primary_email = Some(user.email.clone());
            config.github.token = Some(access_token.to_string());
            config.github_login_acknowledged = true;
            let config_path = crate::utils::config_path();
            if let Err(e) = config.save(&config_path) {
                tracing::warn!("Failed to save config: {}", e);
            }
        }
        
        app_state.update_sentry_scope().await;
        
        // Identify user in PostHog
        let mut props = serde_json::Map::new();
        props.insert("username".to_string(), serde_json::Value::String(user.username.clone()));
        props.insert("email".to_string(), serde_json::Value::String(user.email.clone()));
        props.insert("github_id".to_string(), serde_json::Value::Number(user.github_id.into()));
        
        {
            let props = serde_json::Value::Object(props);
            app_state.track_analytics_event("$identify", Some(props)).await;
        }

        // Track login event
        app_state.track_analytics_event("user_login", None).await;

        let auth_user = AuthUser {
            id: user.id,
            github_id: user.github_id,
            username: user.username,
            email: user.email,
        };

        let response = LoginResponse {
            token,
            user: auth_user,
        };

        ResponseJson(ApiResponse::success(response))
    } else {
        ResponseJson(ApiResponse::error("No access token yet"))
    }
}

/// GET /auth/github/check
#[utoipa::path(
    get,
    path = "/auth/github/check",
    tag = "auth",
    summary = "Check GitHub token validity",
    description = "Validates the stored GitHub access token by making a test API call",
    responses(
        (status = 200, description = "GitHub token is valid"),
        (status = 400, description = "GitHub token is invalid or missing")
    )
)]
pub async fn github_check_token(State(app_state): State<AppState>) -> ResponseJson<ApiResponse<()>> {
    let config = app_state.get_config().read().await;
    let token = config.github.token.clone();
    drop(config);
    if let Some(token) = token {
        let client = reqwest::Client::new();
        let res = client
            .get("https://api.github.com/user")
            .bearer_auth(&token)
            .header("User-Agent", "automagik-forge-app")
            .send()
            .await;
        match res {
            Ok(r) if r.status().is_success() => ResponseJson(ApiResponse::success(())),
            _ => ResponseJson(ApiResponse::error("github_token_invalid")),
        }
    } else {
        ResponseJson(ApiResponse::error("github_token_invalid"))
    }
}

/// GET /auth/user/info
#[utoipa::path(
    get,
    path = "/auth/user/info",
    tag = "auth",
    summary = "Get current user information",
    description = "Gets the current authenticated user's information from JWT token",
    responses(
        (status = 200, description = "User information retrieved successfully", body = ApiResponse<UserInfoResponse>),
        (status = 401, description = "Unauthorized - invalid or missing JWT token", body = ApiResponse<String>)
    )
)]
pub async fn user_info(req: Request) -> ResponseJson<ApiResponse<UserInfoResponse>> {
    if let Some(auth_user) = get_auth_user(&req) {
        let response = UserInfoResponse {
            user: auth_user.clone(),
        };
        ResponseJson(ApiResponse::success(response))
    } else {
        ResponseJson(ApiResponse::error("Unauthorized"))
    }
}

/// GET /auth/users
#[utoipa::path(
    get,
    path = "/auth/users",
    tag = "auth",
    summary = "List all users",
    description = "Retrieves a list of all registered users. Requires authentication.",
    responses(
        (status = 200, description = "Users retrieved successfully", body = ApiResponse<Vec<User>>),
        (status = 401, description = "Unauthorized - invalid or missing JWT token", body = ApiResponse<String>),
        (status = 500, description = "Internal server error", body = ApiResponse<String>)
    )
)]
pub async fn list_users(State(state): State<AppState>, req: Request) -> ResponseJson<ApiResponse<Vec<User>>> {
    // Check if user is authenticated
    if get_auth_user(&req).is_none() {
        return ResponseJson(ApiResponse::error("Unauthorized"));
    }

    match User::list_all(&state.db_pool).await {
        Ok(users) => ResponseJson(ApiResponse::success(users)),
        Err(e) => ResponseJson(ApiResponse::error(&format!("Failed to fetch users: {}", e))),
    }
}

/// POST /auth/logout
#[utoipa::path(
    post,
    path = "/auth/logout",
    tag = "auth",
    summary = "Logout user",
    description = "Logs out the current user (client-side token removal)",
    responses(
        (status = 200, description = "Logout successful", body = ApiResponse<String>)
    )
)]
pub async fn logout() -> ResponseJson<ApiResponse<String>> {
    // Since we're using stateless JWT, logout is handled client-side by removing the token
    // This endpoint exists for consistency and future stateful session management if needed
    ResponseJson(ApiResponse::success("Logout successful".to_string()))
}

/// Middleware to set Sentry user context for every request
pub async fn sentry_user_context_middleware(
    State(app_state): State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    app_state.update_sentry_scope().await;
    next.run(req).await
}
