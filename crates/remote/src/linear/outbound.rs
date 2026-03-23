use reqwest::Client;
use sqlx::PgPool;
use tracing::warn;
use uuid::Uuid;

use crate::linear::{client, crypto, db, loop_guard, sync};

/// Push a VK issue create/update to Linear.
/// `enc_key` is the plaintext AES-256-GCM key from config.
pub async fn push_issue_to_linear(pool: &PgPool, http: &Client, enc_key: &str, vk_issue_id: Uuid) {
    let Ok(Some(issue)) = fetch_issue(pool, vk_issue_id).await else {
        return;
    };
    let Ok(Some(conn)) = db::get_connection_for_project(pool, issue.project_id).await else {
        return;
    };
    let Ok(api_key) = crypto::decrypt(enc_key, &conn.encrypted_api_key) else {
        return;
    };

    match loop_guard::try_acquire(
        pool,
        conn.id,
        vk_issue_id,
        loop_guard::SyncDirection::Outbound,
    )
    .await
    {
        Ok(true) => {}
        _ => return,
    }

    let mappings = db::get_status_mappings(pool, conn.id)
        .await
        .unwrap_or_default();
    let linear_state_id =
        sync::map_vk_status_to_linear(issue.status_id, &mappings).map(String::from);
    let priority = sync::vk_priority_to_linear(issue.priority);
    let due_date = issue.target_date.map(|d| d.format("%Y-%m-%d").to_string());

    let assignee_id = resolve_linear_assignee(pool, http, &api_key, vk_issue_id).await;
    let label_ids = resolve_linear_labels(pool, http, &api_key, &conn, vk_issue_id).await;

    let link = db::get_link_for_vk_issue(pool, vk_issue_id)
        .await
        .unwrap_or(None);

    let result = if let Some(link) = link {
        client::update_issue(
            http,
            &api_key,
            &link.linear_issue_id,
            client::UpdateIssueInput {
                title: Some(&issue.title),
                description: issue.description.as_deref(),
                state_id: linear_state_id.as_deref(),
                priority: Some(priority),
                due_date: due_date.as_deref(),
                assignee_id: assignee_id.as_deref(),
                label_ids: Some(label_ids.clone()),
            },
        )
        .await
    } else {
        let result = client::create_issue(
            http,
            &api_key,
            client::CreateIssueInput {
                team_id: &conn.linear_team_id,
                project_id: conn.linear_project_id.as_deref(),
                title: &issue.title,
                description: issue.description.as_deref(),
                state_id: linear_state_id.as_deref(),
                priority: Some(priority),
                due_date: due_date.as_deref(),
                assignee_id: assignee_id.as_deref(),
                label_ids: Some(label_ids.iter().map(|s| s.as_str()).collect()),
            },
        )
        .await;
        match result {
            Ok(li) => {
                let _ = db::create_issue_link(pool, vk_issue_id, &li.id, &li.identifier).await;
                Ok(())
            }
            Err(e) => Err(e),
        }
    };

    if let Err(e) = result {
        warn!(?e, %vk_issue_id, "Failed to push issue to Linear");
    } else {
        let _ = db::touch_link(pool, vk_issue_id).await;
    }
    loop_guard::release(
        pool,
        conn.id,
        vk_issue_id,
        loop_guard::SyncDirection::Outbound,
    )
    .await
    .ok();
}

/// Delete a Linear issue. Call BEFORE deleting the VK issue so the link record is still present.
/// `encrypted_api_key` is the stored encrypted key for the connection.
pub async fn delete_linear_issue(
    http: &Client,
    enc_key: &str,
    encrypted_api_key: &str,
    linear_issue_id: &str,
) {
    let Ok(api_key) = crypto::decrypt(enc_key, encrypted_api_key) else {
        return;
    };
    let _ = client::delete_issue(http, &api_key, linear_issue_id).await;
}

pub async fn push_comment_to_linear(
    pool: &PgPool,
    http: &Client,
    enc_key: &str,
    vk_comment_id: Uuid,
) {
    let Ok(Some(comment)) = fetch_vk_comment(pool, vk_comment_id).await else {
        return;
    };
    let Ok(Some(issue_link)) = db::get_link_for_vk_issue(pool, comment.issue_id).await else {
        return;
    };
    let Ok(Some(conn)) = db::get_connection_for_project(pool, comment.project_id).await else {
        return;
    };
    let Ok(api_key) = crypto::decrypt(enc_key, &conn.encrypted_api_key) else {
        return;
    };

    let existing = db::get_comment_link(pool, vk_comment_id)
        .await
        .ok()
        .flatten();
    if let Some(linear_comment_id) = existing {
        let _ = client::update_comment(http, &api_key, &linear_comment_id, &comment.message).await;
    } else if let Ok(linear_comment_id) = client::create_comment(
        http,
        &api_key,
        &issue_link.linear_issue_id,
        &comment.message,
    )
    .await
    {
        let _ = db::create_comment_link(pool, conn.id, vk_comment_id, &linear_comment_id).await;
    }
}

/// Delete a Linear comment using pre-captured link data.
/// Must be called AFTER capturing the link data but BEFORE (or after) the VK comment deletion.
/// Use this instead of `delete_comment_from_linear` when the cascade-delete has already removed
/// the `linear_comment_links` row.
pub async fn delete_linear_issue_comment(
    http: &Client,
    enc_key: &str,
    encrypted_api_key: &str,
    linear_comment_id: &str,
) {
    let Ok(api_key) = crypto::decrypt(enc_key, encrypted_api_key) else {
        return;
    };
    let _ = client::delete_comment(http, &api_key, linear_comment_id).await;
}

/// Delete a comment from Linear. Safe to call after the VK comment is deleted since
/// `linear_comment_links` is not cascade-deleted when `issue_comments` rows are removed.
pub async fn delete_comment_from_linear(
    pool: &PgPool,
    http: &Client,
    enc_key: &str,
    vk_comment_id: Uuid,
) {
    let row = sqlx::query!(
        "SELECT linear_comment_id, connection_id FROM linear_comment_links WHERE vk_comment_id = $1",
        vk_comment_id
    )
    .fetch_optional(pool)
    .await;
    let Ok(Some(link_row)) = row else { return };

    let Ok(Some(conn)) = db::get_connection_by_id(pool, link_row.connection_id).await else {
        return;
    };
    let Ok(api_key) = crypto::decrypt(enc_key, &conn.encrypted_api_key) else {
        return;
    };
    let _ = client::delete_comment(http, &api_key, &link_row.linear_comment_id).await;
    let _ = db::delete_comment_link(pool, vk_comment_id).await;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

struct VkIssue {
    project_id: Uuid,
    status_id: Uuid,
    title: String,
    description: Option<String>,
    priority: Option<api_types::issue::IssuePriority>,
    target_date: Option<chrono::DateTime<chrono::Utc>>,
}

async fn fetch_issue(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<VkIssue>> {
    let row = sqlx::query!(
        r#"SELECT project_id, status_id, title, description,
           priority as "priority: api_types::issue::IssuePriority",
           target_date
           FROM issues WHERE id = $1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| VkIssue {
        project_id: r.project_id,
        status_id: r.status_id,
        title: r.title,
        description: r.description,
        priority: r.priority,
        target_date: r.target_date,
    }))
}

struct VkComment {
    issue_id: Uuid,
    project_id: Uuid,
    message: String,
}

async fn fetch_vk_comment(pool: &PgPool, comment_id: Uuid) -> sqlx::Result<Option<VkComment>> {
    let row = sqlx::query!(
        r#"SELECT ic.issue_id, i.project_id, ic.message
           FROM issue_comments ic JOIN issues i ON i.id = ic.issue_id
           WHERE ic.id = $1"#,
        comment_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| VkComment {
        issue_id: r.issue_id,
        project_id: r.project_id,
        message: r.message,
    }))
}

async fn resolve_linear_assignee(
    _pool: &PgPool,
    _http: &Client,
    _api_key: &str,
    _vk_issue_id: Uuid,
) -> Option<String> {
    // Assignee email→Linear user ID resolution is not yet implemented.
    // Linear doesn't expose a "find user by email" query publicly.
    // Return None for now; implementable when team members list is cached.
    None
}

async fn resolve_linear_labels(
    pool: &PgPool,
    http: &Client,
    api_key: &str,
    conn: &db::LinearProjectConnection,
    vk_issue_id: Uuid,
) -> Vec<String> {
    let tag_rows = sqlx::query!(
        "SELECT t.id, t.name, t.color FROM issue_tags it JOIN tags t ON t.id = it.tag_id WHERE it.issue_id = $1",
        vk_issue_id
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let label_links = db::get_label_links(pool, conn.id).await.unwrap_or_default();
    let mut linear_label_ids = Vec::new();

    for tag in &tag_rows {
        if tag.name.eq_ignore_ascii_case(client::IGNORE_LABEL_NAME) {
            continue;
        }
        if let Some(link) = label_links.iter().find(|l| l.vk_tag_id == tag.id) {
            linear_label_ids.push(link.linear_label_id.clone());
        } else {
            let color = tag.color.as_str();
            if let Ok(linear_label_id) =
                client::create_label(http, api_key, &conn.linear_team_id, &tag.name, color).await
            {
                let _ =
                    db::upsert_label_link(pool, conn.id, tag.id, &linear_label_id, &tag.name).await;
                linear_label_ids.push(linear_label_id);
            }
        }
    }
    linear_label_ids
}
