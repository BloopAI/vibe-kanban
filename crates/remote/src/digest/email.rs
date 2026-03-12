use std::collections::{HashMap, VecDeque};

use api_types::NotificationType;
use serde::Serialize;
use uuid::Uuid;

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
    select_preview_rows(rows)
        .into_iter()
        .take(MAX_PREVIEW_ITEMS)
        .map(|row| {
            let payload = &row.payload.0;

            DigestEmailItem {
                deeplink: absolute_url(base_url, payload.deeplink_path.as_deref().unwrap_or("")),
                notification_title: notification_title(row),
                notification_body: None,
            }
        })
        .collect()
}

pub fn notifications_url(base_url: &str) -> String {
    absolute_url(base_url, "/notifications")
}

fn select_preview_rows(rows: &[NotificationDigestRow]) -> Vec<&NotificationDigestRow> {
    let mut groups = build_preview_groups(rows);
    let mut selected = Vec::with_capacity(MAX_PREVIEW_ITEMS.min(rows.len()));

    while selected.len() < MAX_PREVIEW_ITEMS {
        let mut added_in_pass = false;

        for group in &mut groups {
            if let Some(row) = group.rows.pop_front() {
                selected.push(row);
                added_in_pass = true;

                if selected.len() == MAX_PREVIEW_ITEMS {
                    break;
                }
            }
        }

        if !added_in_pass {
            break;
        }
    }

    selected
}

struct PreviewGroup<'a> {
    rows: VecDeque<&'a NotificationDigestRow>,
}

fn build_preview_groups(rows: &[NotificationDigestRow]) -> Vec<PreviewGroup<'_>> {
    let mut groups: Vec<PreviewGroup<'_>> = Vec::new();
    let mut issue_group_indexes: HashMap<Uuid, usize> = HashMap::new();

    for row in rows {
        if let Some(issue_id) = preview_issue_id(row) {
            if let Some(index) = issue_group_indexes.get(&issue_id).copied() {
                groups[index].rows.push_back(row);
            } else {
                let index = groups.len();
                groups.push(PreviewGroup {
                    rows: VecDeque::from([row]),
                });
                issue_group_indexes.insert(issue_id, index);
            }
        } else {
            groups.push(PreviewGroup {
                rows: VecDeque::from([row]),
            });
        }
    }

    groups
}

fn preview_issue_id(row: &NotificationDigestRow) -> Option<Uuid> {
    row.payload.0.issue_id.or(row.issue_id)
}

fn notification_title(row: &NotificationDigestRow) -> String {
    let payload = &row.payload.0;
    let actor_name = &row.actor_name;
    let issue_label = payload
        .issue_simple_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("issue");

    match row.notification_type {
        NotificationType::IssueCommentAdded => format!("{actor_name} commented on {issue_label}"),
        NotificationType::IssueStatusChanged => match (
            payload
                .old_status_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            payload
                .new_status_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
        ) {
            (Some(old_status), Some(new_status)) => format!(
                "{actor_name} changed status of {issue_label} from {old_status} to {new_status}"
            ),
            _ => format!("{actor_name} changed status of {issue_label}"),
        },
        NotificationType::IssueAssigneeChanged => {
            format!("You were assigned to {issue_label} by {actor_name}")
        }
        NotificationType::IssuePriorityChanged => match (
            payload.old_priority.map(|priority| priority.display_name()),
            payload.new_priority.map(|priority| priority.display_name()),
        ) {
            (Some(old_priority), Some(new_priority)) => format!(
                "{actor_name} changed the priority of {issue_label} from {old_priority} to {new_priority}"
            ),
            (None, Some(new_priority)) => {
                format!("{actor_name} changed the priority of {issue_label} to {new_priority}")
            }
            _ => format!("{actor_name} changed the priority of {issue_label}"),
        },
        NotificationType::IssueUnassigned => {
            format!("{actor_name} unassigned you from {issue_label}")
        }
        NotificationType::IssueCommentReaction => {
            let emoji = payload
                .emoji
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());

            match emoji {
                Some(emoji) => {
                    format!("{actor_name} reacted {emoji} to your comment on {issue_label}")
                }
                None => format!("{actor_name} reacted to your comment on {issue_label}"),
            }
        }
        NotificationType::IssueDeleted => format!("{actor_name} deleted {issue_label}"),
        NotificationType::IssueTitleChanged => payload
            .new_title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .map(|value| format!("{actor_name} changed the title of {issue_label} to {value}"))
            .unwrap_or_else(|| format!("{actor_name} changed the title of {issue_label}")),
        NotificationType::IssueDescriptionChanged => {
            format!("{actor_name} changed the description on {issue_label}")
        }
    }
}

fn absolute_url(base_url: &str, deeplink_path: &str) -> String {
    let base_url = base_url.trim_end_matches('/');
    let deeplink_path = deeplink_path.trim_start_matches('/');
    format!("{base_url}/{deeplink_path}")
}
