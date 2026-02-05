use std::sync::Arc;

use codex_app_server_protocol::{ReviewTarget, ThreadForkParams, ThreadStartParams};
use codex_protocol::ThreadId;

use super::client::AppServerClient;
use crate::executors::ExecutorError;

pub async fn launch_codex_review(
    thread_start_params: ThreadStartParams,
    resume_session: Option<String>,
    review_target: ReviewTarget,
    client: Arc<AppServerClient>,
) -> Result<(), ExecutorError> {
    let account = client.get_account(false).await?;
    if account.requires_openai_auth && account.account.is_none() {
        return Err(ExecutorError::AuthRequired(
            "Codex authentication required".to_string(),
        ));
    }

    let thread_id_str = match resume_session {
        Some(session_id) => {
            let response = client
                .thread_fork(ThreadForkParams {
                    thread_id: session_id,
                    path: None,
                    model: thread_start_params.model,
                    model_provider: thread_start_params.model_provider,
                    cwd: thread_start_params.cwd,
                    approval_policy: thread_start_params.approval_policy,
                    sandbox: thread_start_params.sandbox,
                    config: thread_start_params.config,
                    base_instructions: thread_start_params.base_instructions,
                    developer_instructions: thread_start_params.developer_instructions,
                })
                .await?;
            response.thread.id
        }
        None => {
            let response = client.thread_start(thread_start_params).await?;
            response.thread.id
        }
    };

    let thread_id = ThreadId::from_string(&thread_id_str)
        .map_err(|e| ExecutorError::Io(std::io::Error::other(e.to_string())))?;
    client.register_session(&thread_id).await?;

    client.start_review(thread_id_str, review_target).await?;

    Ok(())
}
