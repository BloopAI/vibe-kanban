use std::collections::HashSet;

use api_types::{Issue, NotificationPayload, NotificationType};
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
    extra_payload: NotificationPayload,
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
        Some(issue.id),
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
    extra_payload: NotificationPayload,
    comment_id: Option<Uuid>,
    issue_id: Option<Uuid>,
) {
    if recipients.is_empty() {
        return;
    }

    let payload = build_payload(issue, actor_user_id, notification_type, extra_payload);

    for &recipient_id in recipients {
        if let Err(e) = NotificationRepository::create(
            pool,
            organization_id,
            recipient_id,
            notification_type,
            payload.clone(),
            issue_id,
            comment_id,
        )
        .await
        {
            tracing::warn!(?e, %recipient_id, issue_id = %issue.id, "failed to create notification");
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn send_debounced_issue_notifications(
    pool: &PgPool,
    organization_id: Uuid,
    actor_user_id: Uuid,
    recipients: &[Uuid],
    issue: &Issue,
    notification_type: NotificationType,
    extra_payload: NotificationPayload,
    comment_id: Option<Uuid>,
    issue_id: Option<Uuid>,
) {
    if recipients.is_empty() {
        return;
    }

    let payload = build_payload(issue, actor_user_id, notification_type, extra_payload);

    for &recipient_id in recipients {
        if let Err(e) = NotificationRepository::upsert_recent(
            pool,
            organization_id,
            recipient_id,
            notification_type,
            payload.clone(),
            issue_id,
            comment_id,
        )
        .await
        {
            tracing::warn!(?e, %recipient_id, issue_id = %issue.id, "failed to upsert notification");
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
    extra_payload: NotificationPayload,
) {
    if !is_member(pool, organization_id, recipient_user_id)
        .await
        .unwrap_or(false)
    {
        return;
    }

    send_issue_notifications(
        pool,
        organization_id,
        actor_user_id,
        &[recipient_user_id],
        issue,
        notification_type,
        extra_payload,
        None,
        Some(issue.id),
    )
    .await;
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
    notification_type: NotificationType,
    extra_payload: NotificationPayload,
) -> NotificationPayload {
    let deeplink_path = match notification_type {
        NotificationType::IssueDeleted => format!("/projects/{}", issue.project_id),
        _ => format!("/projects/{}/issues/{}", issue.project_id, issue.id),
    };

    NotificationPayload {
        deeplink_path: Some(deeplink_path),
        issue_id: Some(issue.id),
        issue_simple_id: Some(issue.simple_id.clone()),
        issue_title: Some(issue.title.clone()),
        actor_user_id: Some(actor_user_id),
        comment_preview: extra_payload.comment_preview,
        old_status_id: extra_payload.old_status_id,
        new_status_id: extra_payload.new_status_id,
        old_status_name: extra_payload.old_status_name,
        new_status_name: extra_payload.new_status_name,
        new_title: extra_payload.new_title,
        old_priority: extra_payload.old_priority,
        new_priority: extra_payload.new_priority,
        assignee_user_id: extra_payload.assignee_user_id,
        emoji: extra_payload.emoji,
    }
}
