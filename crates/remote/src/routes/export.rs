use std::{
    collections::HashMap,
    io::{Cursor, Write},
};

use api_types::ExportRequest;
use axum::{
    Json, Router,
    body::Body,
    extract::{Extension, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use chrono::Utc;
use tracing::instrument;
use uuid::Uuid;
use zip::{ZipWriter, write::SimpleFileOptions};

use super::{
    error::ErrorResponse,
    organization_members::{ensure_member_access, ensure_project_access},
};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        export::ExportRepository, issue_assignees::IssueAssigneeRepository,
        issue_relationships::IssueRelationshipRepository, issue_tags::IssueTagRepository,
        project_statuses::ProjectStatusRepository, projects::ProjectRepository,
        pull_request_issues::PullRequestIssueRepository, pull_requests::PullRequestRepository,
        tags::TagRepository,
    },
};

pub(super) fn router() -> Router<AppState> {
    Router::new().route("/export", post(export_data))
}

#[instrument(name = "export.data", skip(state, ctx, payload))]
async fn export_data(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<ExportRequest>,
) -> Result<Response, ErrorResponse> {
    let pool = state.pool();

    // Verify org membership
    ensure_member_access(pool, payload.organization_id, ctx.user.id).await?;

    // Determine which projects to export
    let projects = if payload.project_ids.is_empty() {
        ProjectRepository::list_by_organization(pool, payload.organization_id).await
    } else {
        // Verify access to each project
        for &project_id in &payload.project_ids {
            ensure_project_access(pool, ctx.user.id, project_id).await?;
        }
        ProjectRepository::list_by_organization(pool, payload.organization_id).await
    }
    .map_err(|error| {
        tracing::error!(?error, "failed to list projects for export");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list projects")
    })?;

    let projects: Vec<_> = if payload.project_ids.is_empty() {
        projects
    } else {
        projects
            .into_iter()
            .filter(|p| payload.project_ids.contains(&p.id))
            .collect()
    };

    if projects.is_empty() {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "no projects found to export",
        ));
    }

    let project_ids: Vec<Uuid> = projects.iter().map(|p| p.id).collect();

    // Fetch all data in parallel
    let (
        issues,
        users,
        all_statuses,
        all_tags,
        assignees,
        issue_tags,
        relationships,
        pull_requests,
        pr_issues,
    ) = tokio::try_join!(
        async {
            ExportRepository::list_all_issues_by_projects(pool, &project_ids)
                .await
                .map_err(|e| e.to_string())
        },
        async {
            ExportRepository::list_users_by_organization(pool, payload.organization_id)
                .await
                .map_err(|e| e.to_string())
        },
        async {
            let mut all = Vec::new();
            for pid in &project_ids {
                let statuses = ProjectStatusRepository::list_by_project(pool, *pid)
                    .await
                    .map_err(|e| e.to_string())?;
                all.extend(statuses);
            }
            Ok::<_, String>(all)
        },
        async {
            let mut all = Vec::new();
            for pid in &project_ids {
                let tags = TagRepository::list_by_project(pool, *pid)
                    .await
                    .map_err(|e| e.to_string())?;
                all.extend(tags);
            }
            Ok::<_, String>(all)
        },
        async {
            let mut all = Vec::new();
            for pid in &project_ids {
                let a = IssueAssigneeRepository::list_by_project(pool, *pid)
                    .await
                    .map_err(|e| e.to_string())?;
                all.extend(a);
            }
            Ok::<_, String>(all)
        },
        async {
            let mut all = Vec::new();
            for pid in &project_ids {
                let it = IssueTagRepository::list_by_project(pool, *pid)
                    .await
                    .map_err(|e| e.to_string())?;
                all.extend(it);
            }
            Ok::<_, String>(all)
        },
        async {
            let mut all = Vec::new();
            for pid in &project_ids {
                let r = IssueRelationshipRepository::list_by_project(pool, *pid)
                    .await
                    .map_err(|e| e.to_string())?;
                all.extend(r);
            }
            Ok::<_, String>(all)
        },
        async {
            let mut all = Vec::new();
            for pid in &project_ids {
                let prs = PullRequestRepository::list_by_project(pool, *pid)
                    .await
                    .map_err(|e| e.to_string())?;
                all.extend(prs);
            }
            Ok::<_, String>(all)
        },
        async {
            let mut all = Vec::new();
            for pid in &project_ids {
                let pris = PullRequestIssueRepository::list_by_project(pool, *pid)
                    .await
                    .map_err(|e| e.to_string())?;
                all.extend(pris);
            }
            Ok::<_, String>(all)
        },
    )
    .map_err(|error| {
        tracing::error!(%error, "failed to fetch export data");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to fetch data")
    })?;

    // Optionally fetch comments
    let comments = if payload.include_comments {
        ExportRepository::list_comments_by_projects(pool, &project_ids)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to fetch comments for export");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to fetch comments",
                )
            })?
    } else {
        Vec::new()
    };

    // Optionally fetch attachments metadata
    let attachments = if payload.include_attachments {
        ExportRepository::list_attachments_by_projects(pool, &project_ids)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to fetch attachments for export");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to fetch attachments",
                )
            })?
    } else {
        Vec::new()
    };

    // Build lookup maps
    let project_map: HashMap<Uuid, &str> =
        projects.iter().map(|p| (p.id, p.name.as_str())).collect();
    let status_map: HashMap<Uuid, &str> = all_statuses
        .iter()
        .map(|s| (s.id, s.name.as_str()))
        .collect();
    let tag_map: HashMap<Uuid, &str> = all_tags.iter().map(|t| (t.id, t.name.as_str())).collect();
    let user_map: HashMap<Uuid, String> = users
        .iter()
        .map(|u| {
            let name = format_user_name(
                u.first_name.as_deref(),
                u.last_name.as_deref(),
                u.username.as_deref(),
                &u.email,
            );
            (u.id, name)
        })
        .collect();
    let issue_simple_id_map: HashMap<Uuid, &str> = issues
        .iter()
        .map(|i| (i.id, i.simple_id.as_str()))
        .collect();

    // Build assignee map: issue_id -> comma-separated names
    let mut assignee_map: HashMap<Uuid, Vec<&str>> = HashMap::new();
    for a in &assignees {
        if let Some(name) = user_map.get(&a.user_id) {
            assignee_map
                .entry(a.issue_id)
                .or_default()
                .push(name.as_str());
        }
    }

    // Build issue tag map: issue_id -> comma-separated tag names
    let mut issue_tag_map: HashMap<Uuid, Vec<&str>> = HashMap::new();
    for it in &issue_tags {
        if let Some(name) = tag_map.get(&it.tag_id) {
            issue_tag_map.entry(it.issue_id).or_default().push(name);
        }
    }

    // Create ZIP archive
    let buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buf);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // -- issues.csv --
    {
        let mut csv_buf = Vec::new();
        {
            let mut wtr = csv::Writer::from_writer(&mut csv_buf);
            wtr.write_record([
                "Issue ID",
                "Title",
                "Description",
                "Status",
                "Priority",
                "Project",
                "Assignee(s)",
                "Labels",
                "Creator",
                "Created",
                "Updated",
                "Start Date",
                "Due Date",
                "Completed",
                "Parent Issue",
            ])
            .map_err(|e| csv_error(&e))?;

            for issue in &issues {
                let status_name = status_map.get(&issue.status_id).copied().unwrap_or("");
                let project_name = project_map.get(&issue.project_id).copied().unwrap_or("");
                let assignees_str = assignee_map
                    .get(&issue.id)
                    .map(|v| v.join(", "))
                    .unwrap_or_default();
                let labels_str = issue_tag_map
                    .get(&issue.id)
                    .map(|v| v.join(", "))
                    .unwrap_or_default();
                let creator = issue
                    .creator_user_id
                    .and_then(|uid| user_map.get(&uid))
                    .map(|s| s.as_str())
                    .unwrap_or("");
                let parent = issue
                    .parent_issue_id
                    .and_then(|pid| issue_simple_id_map.get(&pid))
                    .copied()
                    .unwrap_or("");
                let priority = issue
                    .priority
                    .as_ref()
                    .map(|p| format!("{p:?}"))
                    .unwrap_or_default();

                wtr.write_record([
                    &issue.simple_id,
                    &issue.title,
                    issue.description.as_deref().unwrap_or(""),
                    status_name,
                    &priority,
                    project_name,
                    &assignees_str,
                    &labels_str,
                    creator,
                    &issue.created_at.to_rfc3339(),
                    &issue.updated_at.to_rfc3339(),
                    &optional_date(issue.start_date),
                    &optional_date(issue.target_date),
                    &optional_date(issue.completed_at),
                    parent,
                ])
                .map_err(|e| csv_error(&e))?;
            }
            wtr.flush().map_err(|e| {
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;
        }
        zip.start_file("issues.csv", options)
            .map_err(|e| zip_error(&e))?;
        zip.write_all(&csv_buf)
            .map_err(|e| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // -- projects.csv --
    {
        let mut csv_buf = Vec::new();
        {
            let mut wtr = csv::Writer::from_writer(&mut csv_buf);
            wtr.write_record(["Name", "Created", "Updated"])
                .map_err(|e| csv_error(&e))?;
            for project in &projects {
                wtr.write_record([
                    &project.name,
                    &project.created_at.to_rfc3339(),
                    &project.updated_at.to_rfc3339(),
                ])
                .map_err(|e| csv_error(&e))?;
            }
            wtr.flush().map_err(|e| {
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;
        }
        zip.start_file("projects.csv", options)
            .map_err(|e| zip_error(&e))?;
        zip.write_all(&csv_buf)
            .map_err(|e| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // -- tags.csv --
    {
        let mut csv_buf = Vec::new();
        {
            let mut wtr = csv::Writer::from_writer(&mut csv_buf);
            wtr.write_record(["Project", "Tag Name", "Color"])
                .map_err(|e| csv_error(&e))?;
            for tag in &all_tags {
                let project_name = project_map.get(&tag.project_id).copied().unwrap_or("");
                wtr.write_record([project_name, &tag.name, &tag.color])
                    .map_err(|e| csv_error(&e))?;
            }
            wtr.flush().map_err(|e| {
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;
        }
        zip.start_file("tags.csv", options)
            .map_err(|e| zip_error(&e))?;
        zip.write_all(&csv_buf)
            .map_err(|e| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // -- relationships.csv --
    if !relationships.is_empty() {
        let mut csv_buf = Vec::new();
        {
            let mut wtr = csv::Writer::from_writer(&mut csv_buf);
            wtr.write_record(["Issue ID", "Related Issue ID", "Type", "Created"])
                .map_err(|e| csv_error(&e))?;
            for rel in &relationships {
                let issue_sid = issue_simple_id_map
                    .get(&rel.issue_id)
                    .copied()
                    .unwrap_or("");
                let related_sid = issue_simple_id_map
                    .get(&rel.related_issue_id)
                    .copied()
                    .unwrap_or("");
                wtr.write_record([
                    issue_sid,
                    related_sid,
                    &format!("{:?}", rel.relationship_type),
                    &rel.created_at.to_rfc3339(),
                ])
                .map_err(|e| csv_error(&e))?;
            }
            wtr.flush().map_err(|e| {
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;
        }
        zip.start_file("relationships.csv", options)
            .map_err(|e| zip_error(&e))?;
        zip.write_all(&csv_buf)
            .map_err(|e| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // -- pull_requests.csv --
    if !pull_requests.is_empty() {
        // Build PR ID -> issue simple IDs mapping via the join table
        let mut pr_issue_map: HashMap<Uuid, Vec<&str>> = HashMap::new();
        for pri in &pr_issues {
            if let Some(sid) = issue_simple_id_map.get(&pri.issue_id) {
                pr_issue_map
                    .entry(pri.pull_request_id)
                    .or_default()
                    .push(sid);
            }
        }

        let mut csv_buf = Vec::new();
        {
            let mut wtr = csv::Writer::from_writer(&mut csv_buf);
            wtr.write_record([
                "Issue ID(s)",
                "PR URL",
                "PR Number",
                "Status",
                "Merged At",
                "Target Branch",
            ])
            .map_err(|e| csv_error(&e))?;
            for pr in &pull_requests {
                let issue_sids = pr_issue_map
                    .get(&pr.id)
                    .map(|v| v.join(", "))
                    .unwrap_or_default();
                wtr.write_record([
                    &issue_sids,
                    &pr.url,
                    &pr.number.to_string(),
                    &format!("{:?}", pr.status),
                    &optional_date(pr.merged_at),
                    &pr.target_branch_name,
                ])
                .map_err(|e| csv_error(&e))?;
            }
            wtr.flush().map_err(|e| {
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;
        }
        zip.start_file("pull_requests.csv", options)
            .map_err(|e| zip_error(&e))?;
        zip.write_all(&csv_buf)
            .map_err(|e| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // -- users.csv --
    {
        let mut csv_buf = Vec::new();
        {
            let mut wtr = csv::Writer::from_writer(&mut csv_buf);
            wtr.write_record(["Email", "Name"])
                .map_err(|e| csv_error(&e))?;
            for user in &users {
                let name = format_user_name(
                    user.first_name.as_deref(),
                    user.last_name.as_deref(),
                    user.username.as_deref(),
                    &user.email,
                );
                wtr.write_record([&user.email, &name])
                    .map_err(|e| csv_error(&e))?;
            }
            wtr.flush().map_err(|e| {
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;
        }
        zip.start_file("users.csv", options)
            .map_err(|e| zip_error(&e))?;
        zip.write_all(&csv_buf)
            .map_err(|e| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // -- comments.csv (optional) --
    if payload.include_comments && !comments.is_empty() {
        let mut csv_buf = Vec::new();
        {
            let mut wtr = csv::Writer::from_writer(&mut csv_buf);
            wtr.write_record(["Issue ID", "Author", "Message", "Created", "Updated"])
                .map_err(|e| csv_error(&e))?;
            for comment in &comments {
                let issue_sid = issue_simple_id_map
                    .get(&comment.issue_id)
                    .copied()
                    .unwrap_or("");
                let author = comment
                    .author_id
                    .and_then(|uid| user_map.get(&uid))
                    .map(|s| s.as_str())
                    .unwrap_or("");
                wtr.write_record([
                    issue_sid,
                    author,
                    &comment.message,
                    &comment.created_at.to_rfc3339(),
                    &comment.updated_at.to_rfc3339(),
                ])
                .map_err(|e| csv_error(&e))?;
            }
            wtr.flush().map_err(|e| {
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;
        }
        zip.start_file("comments.csv", options)
            .map_err(|e| zip_error(&e))?;
        zip.write_all(&csv_buf)
            .map_err(|e| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // -- attachments.csv + attachment files (optional) --
    if payload.include_attachments && !attachments.is_empty() {
        // Write attachments manifest CSV
        let mut csv_buf = Vec::new();
        {
            let mut wtr = csv::Writer::from_writer(&mut csv_buf);
            wtr.write_record([
                "Issue ID",
                "Filename",
                "Content Type",
                "Size (bytes)",
                "File Path in ZIP",
            ])
            .map_err(|e| csv_error(&e))?;
            for att in &attachments {
                let issue_sid = att
                    .issue_id
                    .and_then(|iid| issue_simple_id_map.get(&iid))
                    .copied()
                    .unwrap_or("unattached");
                let zip_path = format!("attachments/{}/{}", issue_sid, att.original_name);
                wtr.write_record([
                    issue_sid,
                    &att.original_name,
                    att.mime_type.as_deref().unwrap_or(""),
                    &att.size_bytes.to_string(),
                    &zip_path,
                ])
                .map_err(|e| csv_error(&e))?;
            }
            wtr.flush().map_err(|e| {
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;
        }
        zip.start_file("attachments.csv", options)
            .map_err(|e| zip_error(&e))?;
        zip.write_all(&csv_buf)
            .map_err(|e| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        // Download and include actual files
        if let Some(azure_blob) = state.azure_blob() {
            for att in &attachments {
                let issue_sid = att
                    .issue_id
                    .and_then(|iid| issue_simple_id_map.get(&iid))
                    .copied()
                    .unwrap_or("unattached");
                let zip_path = format!("attachments/{}/{}", issue_sid, att.original_name);

                match azure_blob.download_blob(&att.blob_path).await {
                    Ok(data) => {
                        // Store attachments without compression (they're usually already compressed images)
                        let store_options = SimpleFileOptions::default()
                            .compression_method(zip::CompressionMethod::Stored);
                        zip.start_file(&zip_path, store_options)
                            .map_err(|e| zip_error(&e))?;
                        zip.write_all(&data).map_err(|e| {
                            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
                        })?;
                    }
                    Err(error) => {
                        tracing::warn!(
                            ?error,
                            blob_path = %att.blob_path,
                            "failed to download attachment for export, skipping"
                        );
                    }
                }
            }
        }
    }

    let result = zip.finish().map_err(|e| zip_error(&e))?;
    let zip_bytes = result.into_inner();

    let date = Utc::now().format("%Y-%m-%d");
    let filename = format!("vibe-kanban-export-{date}.zip");

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/zip".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        Body::from(zip_bytes),
    )
        .into_response())
}

fn format_user_name(
    first_name: Option<&str>,
    last_name: Option<&str>,
    username: Option<&str>,
    email: &str,
) -> String {
    match (first_name, last_name) {
        (Some(f), Some(l)) => format!("{f} {l}"),
        (Some(f), None) => f.to_string(),
        (None, Some(l)) => l.to_string(),
        (None, None) => username.unwrap_or(email).to_string(),
    }
}

fn optional_date(date: Option<chrono::DateTime<Utc>>) -> String {
    date.map(|d| d.to_rfc3339()).unwrap_or_default()
}

fn csv_error(e: &csv::Error) -> ErrorResponse {
    ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

fn zip_error(e: &zip::result::ZipError) -> ErrorResponse {
    ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}
