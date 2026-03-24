use reqwest::Client;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    linear::crypto,
    slack::{client, db},
};

async fn send(pool: &PgPool, http: &Client, enc_key: &str, project_id: Uuid, text: &str) {
    let Ok(Some(conn)) = db::get_connection_for_project(pool, project_id).await else {
        return;
    };
    let Ok(bot_token) = crypto::decrypt(enc_key, &conn.encrypted_bot_token) else {
        tracing::warn!(%project_id, "failed to decrypt Slack bot token");
        return;
    };
    if let Err(e) = client::post_message(http, &bot_token, &conn.channel_id, text).await {
        tracing::warn!(%project_id, error = %e, "failed to send Slack notification");
    }
}

/// Notify Slack when an issue's status changes.
pub async fn notify_status_change(pool: &PgPool, http: &Client, enc_key: &str, vk_issue_id: Uuid) {
    let Ok(Some(row)) = sqlx::query!(
        r#"
        SELECT i.title, i.project_id, p.name AS project_name, ps.name AS status_name
        FROM issues i
        JOIN projects p ON p.id = i.project_id
        JOIN project_statuses ps ON ps.id = i.status_id
        WHERE i.id = $1
        "#,
        vk_issue_id
    )
    .fetch_optional(pool)
    .await
    else {
        return;
    };

    let text = format!(
        "[{}] Issue status changed: {} → {}",
        row.project_name, row.title, row.status_name
    );
    send(pool, http, enc_key, row.project_id, &text).await;
}

/// Notify Slack when a comment is added to an issue.
pub async fn notify_comment_added(
    pool: &PgPool,
    http: &Client,
    enc_key: &str,
    vk_comment_id: Uuid,
) {
    let Ok(Some(row)) = sqlx::query!(
        r#"
        SELECT ic.message, i.title AS issue_title, i.project_id,
               p.name AS project_name,
               COALESCE(u.username, u.email, 'Unknown') AS author
        FROM issue_comments ic
        JOIN issues i ON i.id = ic.issue_id
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN users u ON u.id = ic.author_id
        WHERE ic.id = $1
        "#,
        vk_comment_id
    )
    .fetch_optional(pool)
    .await
    else {
        return;
    };

    let text = format!(
        "[{}] New comment on \"{}\" by {}",
        row.project_name,
        row.issue_title,
        row.author.unwrap_or_else(|| "Unknown".into())
    );
    send(pool, http, enc_key, row.project_id, &text).await;
}

/// Notify Slack when a PR is created.
/// project_id, project_name, pr_title, and author are passed directly (in scope at call site).
pub async fn notify_pr_created(
    pool: &PgPool,
    http: &Client,
    enc_key: &str,
    project_id: Uuid,
    project_name: &str,
    pr_title: &str,
    author: &str,
) {
    let text = format!(
        "[{}] PR opened: \"{}\" by {}",
        project_name, pr_title, author
    );
    send(pool, http, enc_key, project_id, &text).await;
}
