use api_types::NotificationType;
use serde::Serialize;

use super::DigestUser;
use crate::db::digest::NotificationDigestRow;

const MAX_PREVIEW_ITEMS: usize = 5;

#[derive(Debug, Clone, Serialize)]
pub struct DigestEmailItem {
    pub deeplink: String,
    #[serde(rename = "notificationTitle")]
    pub notification_title: String,
    #[serde(rename = "notificationBody", skip_serializing_if = "Option::is_none")]
    pub notification_body: Option<String>,
}

pub fn recipient_name(user: &DigestUser) -> String {
    user.first_name
        .clone()
        .or_else(|| user.username.clone())
        .unwrap_or_else(|| "there".to_string())
}

pub fn build_preview_items(rows: &[NotificationDigestRow], base_url: &str) -> Vec<DigestEmailItem> {
    rows.iter()
        .take(MAX_PREVIEW_ITEMS)
        .map(|row| {
            let payload = &row.payload.0;

            DigestEmailItem {
                deeplink: absolute_url(base_url, payload.deeplink_path.as_deref().unwrap_or("")),
                notification_title: notification_title(row),
                notification_body: notification_body(row),
            }
        })
        .collect()
}

fn notification_title(row: &NotificationDigestRow) -> String {
    let payload = &row.payload.0;
    let issue_title = payload.issue_title.as_deref().unwrap_or("Untitled issue");
    let actor_name = &row.actor_name;

    match row.notification_type {
        NotificationType::IssueCommentAdded => format!("{actor_name} commented on {issue_title}"),
        NotificationType::IssueStatusChanged => {
            format!("{actor_name} changed the status on {issue_title}")
        }
        NotificationType::IssueAssigneeChanged => {
            format!("You were assigned to {issue_title} by {actor_name}")
        }
        NotificationType::IssuePriorityChanged => {
            format!("{actor_name} changed the priority on {issue_title}")
        }
        NotificationType::IssueUnassigned => {
            format!("You were unassigned from {issue_title} by {actor_name}")
        }
        NotificationType::IssueCommentReaction => {
            format!("{actor_name} reacted to your comment on {issue_title}")
        }
        NotificationType::IssueDeleted => format!("{actor_name} deleted {issue_title}"),
        NotificationType::IssueTitleChanged => {
            let new_title = payload
                .new_title
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .or_else(|| payload.issue_title.clone())
                .unwrap_or_else(|| "Untitled issue".to_string());
            format!("Issue title changed to {new_title} by {actor_name}")
        }
        NotificationType::IssueDescriptionChanged => {
            format!("Description updated on {issue_title} by {actor_name}")
        }
    }
}

fn notification_body(row: &NotificationDigestRow) -> Option<String> {
    let payload = &row.payload.0;

    match row.notification_type {
        NotificationType::IssueCommentAdded => payload
            .comment_preview
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned),
        NotificationType::IssueStatusChanged => Some(format!(
            "{} -> {}",
            payload
                .old_status_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())?,
            payload
                .new_status_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())?,
        )),
        NotificationType::IssuePriorityChanged => Some(format!(
            "{} -> {}",
            payload.old_priority.map(|priority| priority.to_string())?,
            payload.new_priority.map(|priority| priority.to_string())?,
        )),
        NotificationType::IssueCommentReaction => None,
        _ => None,
    }
}

fn absolute_url(base_url: &str, deeplink_path: &str) -> String {
    let base_url = base_url.trim_end_matches('/');
    let deeplink_path = deeplink_path.trim_start_matches('/');
    format!("{base_url}/{deeplink_path}")
}
