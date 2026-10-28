use std::sync::{Arc, Mutex};

use acp::schema::v1::{
    PermissionOptionKind, RequestPermissionOutcome, RequestPermissionRequest,
    RequestPermissionResponse, SelectedPermissionOutcome,
};
use tokio::sync::mpsc::UnboundedSender;
use tracing::{debug, warn};
use workspace_utils::approvals::ApprovalStatus;

use crate::{
    approvals::{ExecutorApprovalError, ExecutorApprovalService},
    executors::{
        CancellationToken,
        acp::{AcpEvent, ApprovalResponse, to_v08},
    },
};

pub(crate) fn auto_approve(req: &RequestPermissionRequest) -> RequestPermissionResponse {
    for option in &req.options {
        if option.kind == PermissionOptionKind::AllowOnce {
            return RequestPermissionResponse::new(RequestPermissionOutcome::Selected(
                SelectedPermissionOutcome::new(option.option_id.clone()),
            ));
        }
    }
    RequestPermissionResponse::new(RequestPermissionOutcome::Cancelled)
}

fn send_event(log_tx: &UnboundedSender<String>, event: AcpEvent) {
    if let Err(e) = log_tx.send(event.to_string()) {
        warn!("Failed to send ACP event: {}", e);
    }
}

fn handle_approval_error(
    log_tx: &UnboundedSender<String>,
    err: ExecutorApprovalError,
    tool_call_id: &str,
) -> RequestPermissionResponse {
    if let ExecutorApprovalError::Cancelled = err {
        debug!("ACP approval cancelled for tool_call_id={}", tool_call_id);
        send_event(
            log_tx,
            AcpEvent::ApprovalResponse(ApprovalResponse {
                tool_call_id: tool_call_id.to_string(),
                status: ApprovalStatus::Denied {
                    reason: Some("Cancelled".into()),
                },
            }),
        );
    } else {
        tracing::error!(
            "ACP approval wait failed for tool_call_id={}: {err}",
            tool_call_id
        );
        send_event(
            log_tx,
            AcpEvent::ApprovalResponse(ApprovalResponse {
                tool_call_id: tool_call_id.to_string(),
                status: ApprovalStatus::TimedOut,
            }),
        );
    }
    RequestPermissionResponse::new(RequestPermissionOutcome::Cancelled)
}

pub(crate) async fn ask_user(
    req: &RequestPermissionRequest,
    approvals: Arc<dyn ExecutorApprovalService>,
    cancel: CancellationToken,
    log_tx: &UnboundedSender<String>,
    denial_feedback: Arc<Mutex<Vec<String>>>,
) -> RequestPermissionResponse {
    if let Some(event) = to_v08(req.clone()).map(AcpEvent::RequestPermission) {
        send_event(log_tx, event);
    }

    let tool_call_id = req.tool_call.tool_call_id.0.to_string();
    let tool_name = req.tool_call.fields.title.as_deref().unwrap_or("tool");

    let approval_id = match approvals.create_tool_approval(tool_name).await {
        Ok(id) => id,
        Err(err) => return handle_approval_error(log_tx, err, &tool_call_id),
    };

    send_event(
        log_tx,
        AcpEvent::ApprovalRequested {
            tool_call_id: tool_call_id.clone(),
            approval_id: approval_id.clone(),
        },
    );

    let status = match approvals
        .wait_tool_approval(&approval_id, cancel.clone())
        .await
    {
        Ok(s) => s,
        Err(err) => return handle_approval_error(log_tx, err, &tool_call_id),
    };

    tracing::debug!("✓ Approval status received {:?}", status);

    // Map our ApprovalStatus to ACP outcome
    let outcome = match &status {
        ApprovalStatus::Approved => {
            let chosen = req
                .options
                .iter()
                .find(|o| matches!(o.kind, PermissionOptionKind::AllowOnce));
            if let Some(opt) = chosen {
                RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                    opt.option_id.clone(),
                ))
            } else {
                tracing::error!("No suitable approval option found, cancelling");
                return RequestPermissionResponse::new(RequestPermissionOutcome::Cancelled);
            }
        }
        ApprovalStatus::Denied { reason } => {
            // If user provided a reason, queue it to send after denial
            if let Some(feedback) = reason.as_ref() {
                denial_feedback
                    .lock()
                    .unwrap()
                    .push(feedback.trim().to_string());
            }
            let chosen = req
                .options
                .iter()
                .find(|o| matches!(o.kind, PermissionOptionKind::RejectOnce));
            if let Some(opt) = chosen {
                RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                    opt.option_id.clone(),
                ))
            } else {
                warn!("No permission options for denial, cancelling");
                RequestPermissionOutcome::Cancelled
            }
        }
        ApprovalStatus::TimedOut => {
            warn!("Approval timed out");
            RequestPermissionOutcome::Cancelled
        }
        ApprovalStatus::Pending => {
            // This should not occur after waiter resolves
            warn!("Approval resolved to Pending");
            RequestPermissionOutcome::Cancelled
        }
    };

    send_event(
        log_tx,
        AcpEvent::ApprovalResponse(ApprovalResponse {
            tool_call_id: tool_call_id.clone(),
            status: status.clone(),
        }),
    );

    RequestPermissionResponse::new(outcome)
}

#[cfg(test)]
mod tests {
    use acp::schema::v1::{
        PermissionOption, PermissionOptionKind, RequestPermissionOutcome, RequestPermissionRequest,
        RequestPermissionResponse, SelectedPermissionOutcome, ToolCallUpdate, ToolCallUpdateFields,
    };

    use crate::executors::acp::permissions::auto_approve;

    #[test]
    fn allow_once_option_approves() {
        assert_eq!(
            auto_approve(&RequestPermissionRequest::new(
                "session_id".to_string(),
                ToolCallUpdate::new("tool_call_id", ToolCallUpdateFields::default()),
                vec![
                    PermissionOption::new(
                        "option_id",
                        "allow_once",
                        PermissionOptionKind::AllowOnce,
                    ),
                    PermissionOption::new("option_id2", "deny", PermissionOptionKind::RejectOnce,)
                ],
            )),
            RequestPermissionResponse::new(RequestPermissionOutcome::Selected(
                SelectedPermissionOutcome::new("option_id"),
            ))
        )
    }

    #[test]
    fn no_allow_once_option_denies() {
        assert_eq!(
            auto_approve(&RequestPermissionRequest::new(
                "session_id".to_string(),
                ToolCallUpdate::new("tool_call_id", ToolCallUpdateFields::default()),
                vec![
                    PermissionOption::new(
                        "option_id",
                        "allow_once",
                        PermissionOptionKind::AllowAlways,
                    ),
                    PermissionOption::new("option_id2", "deny", PermissionOptionKind::RejectOnce)
                ],
            )),
            RequestPermissionResponse::new(RequestPermissionOutcome::Cancelled)
        )
    }
}
