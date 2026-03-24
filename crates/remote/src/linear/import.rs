use reqwest::Client;
use sqlx::PgPool;
use tracing::{info, warn};
use uuid::Uuid;

use crate::linear::{client, db, sync};

pub struct ImportContext {
    pub pool: PgPool,
    pub http_client: Client,
    pub connection_id: Uuid,
    pub project_id: Uuid,
    pub linear_team_id: String,
    pub linear_project_id: Option<String>,
    pub api_key: String,
    /// First VK status ID to use as fallback when no mapping exists
    pub fallback_status_id: Uuid,
    pub creator_user_id: Uuid,
}

pub async fn run_initial_import(ctx: ImportContext) -> anyhow::Result<()> {
    let mappings = db::get_status_mappings(&ctx.pool, ctx.connection_id).await?;
    let mut cursor: Option<String> = None;
    let mut total = 0usize;

    loop {
        let (issues, has_next, next_cursor) = client::list_issues_page(
            &ctx.http_client,
            &ctx.api_key,
            &ctx.linear_team_id,
            ctx.linear_project_id.as_deref(),
            cursor.as_deref(),
        )
        .await?;

        for linear_issue in &issues {
            // Update ignore/branch state for already-linked issues
            if let Some(link) = db::get_link_for_linear_issue(&ctx.pool, &linear_issue.id).await? {
                let should_ignore = linear_issue.has_ignore_label();
                if should_ignore != link.linear_ignored
                    && let Err(e) =
                        db::set_linear_ignored(&ctx.pool, &linear_issue.id, should_ignore).await
                {
                    warn!(?e, linear_id = %linear_issue.id, "Failed to update linear_ignored");
                }
                let branch = linear_issue.worktree_branch();
                if branch.as_deref() != link.worktree_branch.as_deref()
                    && let Err(e) =
                        db::set_worktree_branch(&ctx.pool, &linear_issue.id, branch.as_deref())
                            .await
                {
                    warn!(?e, linear_id = %linear_issue.id, "Failed to update worktree_branch");
                }
                continue;
            }

            if linear_issue.has_ignore_label() {
                continue;
            }

            let status_id = sync::map_linear_state_to_vk(
                &linear_issue.state.id,
                &mappings,
                ctx.fallback_status_id,
            );
            let priority = sync::linear_priority_to_vk(linear_issue.priority);

            // Parse Linear due_date ("YYYY-MM-DD") into DateTime<Utc> for target_date
            let target_date = linear_issue.due_date.as_deref().and_then(|d| {
                chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
                    .ok()
                    .and_then(|date| date.and_hms_opt(0, 0, 0))
                    .map(|ndt| ndt.and_utc())
            });

            let sort_order = total as f64;

            let result = crate::db::issues::IssueRepository::create(
                &ctx.pool,
                None, // id: auto-generate
                ctx.project_id,
                status_id,
                linear_issue.title.clone(),
                linear_issue.description.clone(),
                priority,
                None,        // start_date
                target_date, // target_date (Linear due_date)
                None,        // completed_at
                sort_order,
                None, // parent_issue_id
                None, // parent_issue_sort_order
                serde_json::Value::Object(Default::default()),
                ctx.creator_user_id,
            )
            .await;

            match result {
                Ok(resp) => {
                    let vk_id = resp.data.id;
                    if let Err(e) = db::create_issue_link(
                        &ctx.pool,
                        vk_id,
                        &linear_issue.id,
                        &linear_issue.identifier,
                    )
                    .await
                    {
                        warn!(?e, linear_id = %linear_issue.id, "Failed to create issue link");
                    } else {
                        total += 1;
                    }
                }
                Err(e) => {
                    warn!(
                        ?e,
                        linear_id = %linear_issue.id,
                        "Failed to create VK issue during import"
                    );
                }
            }
        }

        if !has_next {
            break;
        }
        cursor = next_cursor;
    }

    info!(total, project_id = %ctx.project_id, "Linear initial import complete");
    Ok(())
}
