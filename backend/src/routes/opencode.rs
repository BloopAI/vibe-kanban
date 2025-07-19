use axum::{routing::get, Json as ResponseJson, Router};
use tokio::process::Command;

use crate::{app_state::AppState, models::ApiResponse, utils::shell::get_shell_command};

pub fn opencode_router() -> Router<AppState> {
    Router::new().route("/opencode/models", get(get_models))
}

async fn get_models() -> ResponseJson<ApiResponse<Vec<String>>> {
    let (shell_cmd, shell_arg) = get_shell_command();
    let output = Command::new(shell_cmd)
        .arg(shell_arg)
        .arg("opencode models")
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let models = stdout
                .lines()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty())
                .map(String::from)
                .collect();
            ResponseJson(ApiResponse {
                success: true,
                data: Some(models),
                message: Some("Opencode models retrieved successfully".to_string()),
            })
        }
        Ok(out) => ResponseJson(ApiResponse {
            success: false,
            data: None,
            message: Some(format!(
                "Failed to run opencode models: exit code {}",
                out.status
            )),
        }),
        Err(e) => ResponseJson(ApiResponse {
            success: false,
            data: None,
            message: Some(format!("Failed to run opencode models: {}", e)),
        }),
    }
}
