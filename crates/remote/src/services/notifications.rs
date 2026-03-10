use std::collections::HashSet;

use api_types::{Issue, NotificationType};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::{
    issue_assignees::IssueAssigneeRepository, issue_followers::IssueFollowerRepository,
    notifications::NotificationRepository, organization_members::is_member,
};

pub async fn notify_issue_subscribers(
    pool: &PgPool,
    organization_id: Uuid,
    actor_user_id: Uuid,
    issue: &Issue,
    notification_type: NotificationType,
    extra_payload: serde_json::Value,
    comment_id: Option<Uuid>,
) {
    let recipients = match collect_issue_recipients(pool, organization_id, issue.id, actor_user_id)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(?e, issue_id = %issue.id, "failed to collect notification recipients");
            return;
        }
    };

    send_issue_notifications(
        pool,
        organization_id,
        actor_user_id,
        &recipients,
        issue,
        notification_type,
        extra_payload,
        comment_id,
    )
    .await;
}

/// Like `notify_issue_subscribers` but with pre-collected recipients.
/// Use when recipients must be gathered before an operation (e.g. delete) but
/// notifications should only be sent after it succeeds.
#[allow(clippy::too_many_arguments)]
pub async fn send_issue_notifications(
    pool: &PgPool,
    organization_id: Uuid,
    actor_user_id: Uuid,
    recipients: &[Uuid],
    issue: &Issue,
    notification_type: NotificationType,
    extra_payload: serde_json::Value,
    comment_id: Option<Uuid>,
) {
    if recipients.is_empty() {
        return;
    }

    let payload = build_payload(issue, actor_user_id, extra_payload);

    for &recipient_id in recipients {
        if let Err(e) = NotificationRepository::create(
            pool,
            organization_id,
            recipient_id,
            notification_type,
            payload.clone(),
            Some(issue.id),
            comment_id,
        )
        .await
        {
            tracing::warn!(?e, %recipient_id, issue_id = %issue.id, "failed to create notification");
        }
    }
}

pub async fn notify_user(
    pool: &PgPool,
    organization_id: Uuid,
    actor_user_id: Uuid,
    recipient_user_id: Uuid,
    issue: &Issue,
    notification_type: NotificationType,
    extra_payload: serde_json::Value,
) {
    if !is_member(pool, organization_id, recipient_user_id)
        .await
        .unwrap_or(false)
    {
        return;
    }

    let payload = build_payload(issue, actor_user_id, extra_payload);

    if let Err(e) = NotificationRepository::create(
        pool,
        organization_id,
        recipient_user_id,
        notification_type,
        payload,
        Some(issue.id),
        None,
    )
    .await
    {
        tracing::warn!(?e, %recipient_user_id, issue_id = %issue.id, "failed to create notification");
    }
}

pub async fn collect_issue_recipients(
    pool: &PgPool,
    organization_id: Uuid,
    issue_id: Uuid,
    exclude_user_id: Uuid,
) -> Result<Vec<Uuid>, Box<dyn std::error::Error + Send + Sync>> {
    let assignees = IssueAssigneeRepository::list_by_issue(pool, issue_id).await?;
    let followers = IssueFollowerRepository::list_by_issue(pool, issue_id).await?;

    let mut user_ids: HashSet<Uuid> = assignees.iter().map(|a| a.user_id).collect();
    user_ids.extend(followers.iter().map(|f| f.user_id));
    user_ids.remove(&exclude_user_id);

    let mut recipients = Vec::with_capacity(user_ids.len());
    for user_id in user_ids {
        if is_member(pool, organization_id, user_id)
            .await
            .unwrap_or(false)
        {
            recipients.push(user_id);
        }
    }

    Ok(recipients)
}

fn build_payload(
    issue: &Issue,
    actor_user_id: Uuid,
    extra_payload: serde_json::Value,
) -> serde_json::Value {
    let deeplink_path = format!("/projects/{}/issues/{}", issue.project_id, issue.id);
    let mut payload = json!({
        "deeplink_path": deeplink_path,
        "issue_title": issue.title,
        "actor_user_id": actor_user_id.to_string(),
    });

    if let (Some(base), Some(extra)) = (payload.as_object_mut(), extra_payload.as_object()) {
        for (k, v) in extra {
            base.insert(k.clone(), v.clone());
        }
    }

    payload
}
