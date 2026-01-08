//! Review-specific functionality for the Codex executor.

use std::sync::Arc;

use codex_app_server_protocol::{NewConversationParams, ReviewTarget};

use super::{
    client::{AppServerClient, LogWriter},
    jsonrpc::{ExitSignalSender, JsonRpcPeer},
    session::SessionHandler,
};
use crate::{
    actions::review::{CommitRange, RepoReviewContext},
    approvals::ExecutorApprovalService,
    executors::ExecutorError,
};

/// Launch a Codex review session.
#[allow(clippy::too_many_arguments)]
pub async fn launch_codex_review(
    conversation_params: NewConversationParams,
    resume_session: Option<String>,
    review_target: ReviewTarget,
    child_stdout: tokio::process::ChildStdout,
    child_stdin: tokio::process::ChildStdin,
    log_writer: LogWriter,
    exit_signal_tx: ExitSignalSender,
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
    auto_approve: bool,
) -> Result<(), ExecutorError> {
    let client = AppServerClient::new(log_writer, approvals, auto_approve);
    let rpc_peer = JsonRpcPeer::spawn(child_stdin, child_stdout, client.clone(), exit_signal_tx);
    client.connect(rpc_peer);
    client.initialize().await?;
    let auth_status = client.get_auth_status().await?;
    if auth_status.requires_openai_auth.unwrap_or(true) && auth_status.auth_method.is_none() {
        return Err(ExecutorError::AuthRequired(
            "Codex authentication required".to_string(),
        ));
    }

    let conversation_id = match resume_session {
        Some(session_id) => {
            let (rollout_path, _forked_session_id) = SessionHandler::fork_rollout_file(&session_id)
                .map_err(|e| ExecutorError::FollowUpNotSupported(e.to_string()))?;
            let response = client
                .resume_conversation(rollout_path.clone(), conversation_params)
                .await?;
            tracing::debug!(
                "resuming session for review using rollout file {}, response {:?}",
                rollout_path.display(),
                response
            );
            response.conversation_id
        }
        None => {
            let response = client.new_conversation(conversation_params).await?;
            response.conversation_id
        }
    };

    client.register_session(&conversation_id).await?;
    client.add_conversation_listener(conversation_id).await?;

    client
        .start_review(conversation_id.to_string(), review_target)
        .await?;

    Ok(())
}

/// Map review context and additional prompt to a Codex ReviewTarget.
pub fn map_to_review_target(
    context: Option<&[RepoReviewContext]>,
    additional_prompt: Option<&str>,
) -> ReviewTarget {
    // If no context provided, use Custom with additional_prompt or UncommittedChanges
    let Some(repos) = context else {
        return match additional_prompt {
            Some(prompt) if !prompt.trim().is_empty() => ReviewTarget::Custom {
                instructions: prompt.to_string(),
            },
            _ => ReviewTarget::UncommittedChanges,
        };
    };

    if repos.is_empty() {
        return match additional_prompt {
            Some(prompt) if !prompt.trim().is_empty() => ReviewTarget::Custom {
                instructions: prompt.to_string(),
            },
            _ => ReviewTarget::UncommittedChanges,
        };
    }

    // For multiple repos or complex scenarios, build Custom instructions
    if repos.len() > 1 {
        let mut instructions = String::new();
        for repo in repos {
            instructions.push_str(&format!("Repository: {}\n", repo.repo_name));
            match &repo.commits {
                CommitRange::FromBase { commit } => {
                    instructions.push_str(&format!(
                        "Review all changes from base commit {} to HEAD.\n",
                        commit
                    ));
                }
                CommitRange::Specific { commits } => {
                    instructions.push_str("Review the following commits:\n");
                    for hash in commits {
                        instructions.push_str(&format!("- {}\n", hash));
                    }
                }
                CommitRange::Range { from, to } => {
                    instructions.push_str(&format!(
                        "Review all changes from commit {} to {}.\n",
                        from, to
                    ));
                }
            }
            instructions.push('\n');
        }
        if let Some(prompt) = additional_prompt {
            instructions.push_str(prompt);
        }
        return ReviewTarget::Custom { instructions };
    }

    // Single repo - map to native ReviewTarget where possible
    let repo = &repos[0];
    match &repo.commits {
        CommitRange::FromBase { commit } => {
            // Map to BaseBranch - the commit serves as the base reference
            match additional_prompt {
                Some(prompt) if !prompt.trim().is_empty() => {
                    // With additional prompt, use Custom
                    ReviewTarget::Custom {
                        instructions: format!(
                            "Review all changes from base commit {} to HEAD in {}.\n{}",
                            commit, repo.repo_name, prompt
                        ),
                    }
                }
                _ => ReviewTarget::BaseBranch {
                    branch: commit.clone(),
                },
            }
        }
        CommitRange::Specific { commits } => {
            if commits.len() == 1 {
                // Single commit - map to Commit
                match additional_prompt {
                    Some(prompt) if !prompt.trim().is_empty() => ReviewTarget::Custom {
                        instructions: format!(
                            "Review commit {} in {}.\n{}",
                            commits[0], repo.repo_name, prompt
                        ),
                    },
                    _ => ReviewTarget::Commit {
                        sha: commits[0].clone(),
                        title: None,
                    },
                }
            } else {
                // Multiple commits - use Custom
                let mut instructions = format!("Repository: {}\n", repo.repo_name);
                instructions.push_str("Review the following commits:\n");
                for hash in commits {
                    instructions.push_str(&format!("- {}\n", hash));
                }
                if let Some(prompt) = additional_prompt {
                    instructions.push_str(prompt);
                }
                ReviewTarget::Custom { instructions }
            }
        }
        CommitRange::Range { from, to } => {
            // Range doesn't have a direct mapping, use Custom
            let mut instructions = format!(
                "Repository: {}\nReview all changes from commit {} to {}.\n",
                repo.repo_name, from, to
            );
            if let Some(prompt) = additional_prompt {
                instructions.push_str(prompt);
            }
            ReviewTarget::Custom { instructions }
        }
    }
}
