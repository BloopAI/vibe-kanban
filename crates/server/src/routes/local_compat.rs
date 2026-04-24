use std::collections::{HashMap, HashSet};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::{get, patch, post},
};
use chrono::Utc;
use db::models::{
    project::Project,
    pull_request::PullRequest,
    repo::Repo,
    scratch::{ProjectStatusConfigData, Scratch, ScratchPayload, ScratchType},
    task::{Task, TaskStatus},
    workspace::Workspace,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use serde_json::json;
use services::services::container::ContainerService;
use sqlx::{QueryBuilder, Sqlite};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Serialize)]
struct CompatProjectStatus {
    id: String,
    project_id: String,
    name: String,
    color: String,
    sort_order: i64,
    hidden: bool,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct CompatIssue {
    id: String,
    project_id: String,
    issue_number: i64,
    simple_id: String,
    status_id: String,
    title: String,
    description: Option<String>,
    priority: Option<String>,
    start_date: Option<String>,
    target_date: Option<String>,
    completed_at: Option<String>,
    sort_order: i64,
    parent_issue_id: Option<String>,
    parent_issue_sort_order: Option<i64>,
    extension_metadata: serde_json::Value,
    creator_user_id: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct CompatWorkspace {
    id: String,
    project_id: String,
    owner_user_id: String,
    issue_id: Option<String>,
    local_workspace_id: Option<String>,
    name: Option<String>,
    archived: bool,
    files_changed: Option<i64>,
    lines_added: Option<i64>,
    lines_removed: Option<i64>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct CompatPullRequest {
    id: String,
    url: String,
    number: i64,
    status: String,
    merged_at: Option<String>,
    merge_commit_sha: Option<String>,
    target_branch_name: String,
    project_id: String,
    issue_id: String,
    workspace_id: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct CompatPullRequestIssue {
    id: String,
    pull_request_id: String,
    issue_id: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct LocalTaskRow {
    id: Uuid,
    project_id: Uuid,
    title: String,
    description: Option<String>,
    status: TaskStatus,
    parent_workspace_id: Option<Uuid>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone)]
struct SyntheticProjectContext {
    project: Project,
    repo_ids: HashSet<Uuid>,
}

#[derive(Debug, Default, Clone)]
struct SyntheticWorkspacePrState {
    has_open_pr: bool,
    latest_merged_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
struct ProjectQuery {
    project_id: Uuid,
}

#[derive(Debug, Deserialize)]
struct CreateIssueRequest {
    project_id: Uuid,
    status_id: String,
    title: String,
    description: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct UpdateIssueRequest {
    status_id: Option<String>,
    title: Option<String>,
    description: Option<Option<String>>,
    parent_issue_id: Option<Option<Uuid>>,
}

#[derive(Debug, Deserialize)]
struct BulkIssueUpdateRequest {
    updates: Vec<BulkIssueUpdateItem>,
}

#[derive(Debug, Deserialize)]
struct BulkIssueUpdateItem {
    id: Uuid,
    status_id: Option<String>,
    title: Option<String>,
    description: Option<Option<String>>,
    parent_issue_id: Option<Option<Uuid>>,
}

#[derive(Debug, Serialize)]
struct MutationTxidResponse {
    txid: i64,
}

fn normalize_project_name(name: &str) -> String {
    name.trim().to_ascii_lowercase()
}

fn normalize_status_key(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| {
            ch.to_ascii_lowercase()
                .to_string()
                .chars()
                .collect::<Vec<_>>()
        })
        .collect()
}

fn task_status_id(status: &TaskStatus) -> &'static str {
    match status {
        TaskStatus::Todo => "todo",
        TaskStatus::InProgress => "in_progress",
        TaskStatus::InReview => "in_review",
        TaskStatus::Done => "done",
        TaskStatus::Cancelled => "cancelled",
    }
}

fn task_status_name(status: &TaskStatus) -> &'static str {
    match status {
        TaskStatus::Todo => "To do",
        TaskStatus::InProgress => "In progress",
        TaskStatus::InReview => "In review",
        TaskStatus::Done => "Done",
        TaskStatus::Cancelled => "Cancelled",
    }
}

fn parse_task_status(status_id: &str) -> TaskStatus {
    match normalize_status_key(status_id).as_str() {
        "inprogress" => TaskStatus::InProgress,
        "inreview" | "instaging" => TaskStatus::InReview,
        "done" | "completed" => TaskStatus::Done,
        "cancelled" | "canceled" => TaskStatus::Cancelled,
        _ => TaskStatus::Todo,
    }
}

fn canonical_status_name(status_id: &str) -> String {
    match normalize_status_key(status_id).as_str() {
        "inprogress" => "In progress".to_string(),
        "inreview" => "In review".to_string(),
        "instaging" => "In Staging".to_string(),
        "done" | "completed" => "Done".to_string(),
        "cancelled" | "canceled" => "Cancelled".to_string(),
        _ => "To do".to_string(),
    }
}

fn is_in_staging_status(value: &str) -> bool {
    normalize_status_key(value) == "instaging"
}

fn status_id_from_name(name: &str) -> String {
    match normalize_status_key(name).as_str() {
        "inprogress" => "in_progress".to_string(),
        "inreview" => "in_review".to_string(),
        "instaging" => "in_staging".to_string(),
        "done" | "completed" => "done".to_string(),
        "cancelled" | "canceled" => "cancelled".to_string(),
        "todo" => "todo".to_string(),
        other => format!("status_{other}"),
    }
}

fn status_color(name: &str) -> &'static str {
    match normalize_status_key(name).as_str() {
        "inprogress" => "42 90% 55%",
        "inreview" => "280 55% 58%",
        "instaging" => "196 72% 47%",
        "done" | "completed" => "145 55% 42%",
        "cancelled" | "canceled" => "0 0% 55%",
        _ => "220 70% 52%",
    }
}

fn status_sort_order(name: &str) -> i64 {
    match normalize_status_key(name).as_str() {
        "todo" => 0,
        "inprogress" => 1,
        "inreview" => 2,
        "instaging" => 3,
        "done" | "completed" => 4,
        "cancelled" | "canceled" => 5,
        _ => 100,
    }
}

fn status_hidden(name: &str) -> bool {
    matches!(
        normalize_status_key(name).as_str(),
        "cancelled" | "canceled"
    )
}

fn extract_status_name(description: Option<&str>, fallback: &TaskStatus) -> String {
    for line in description.unwrap_or_default().lines() {
        if let Some(value) = line.trim().strip_prefix("- Original Status:") {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        if let Some(value) = line.trim().strip_prefix("Original Status:") {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    task_status_name(fallback).to_string()
}

fn ensure_status_metadata(description: Option<String>, status_name: &str) -> Option<String> {
    let body = description.unwrap_or_default();
    let mut replaced = false;
    let mut lines = Vec::new();

    for line in body.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("- Original Status:") || trimmed.starts_with("Original Status:") {
            let prefix_len = line.len() - trimmed.len();
            let prefix = &line[..prefix_len];
            lines.push(format!("{prefix}- Original Status: {status_name}"));
            replaced = true;
        } else {
            lines.push(line.to_string());
        }
    }

    let mut next = lines.join(
        "
",
    );
    if !replaced {
        if !next.trim().is_empty() {
            next.push_str(
                "

",
            );
        }
        next.push_str(
            "Local metadata
- Original Status: ",
        );
        next.push_str(status_name);
    }

    let trimmed = next.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn compat_statuses(
    project_id: Uuid,
    tasks: &[LocalTaskRow],
    configured_statuses: &[ProjectStatusConfigData],
) -> Vec<CompatProjectStatus> {
    let created_at = Utc::now().to_rfc3339();
    let mut ordered_statuses = Vec::<ProjectStatusConfigData>::new();
    let mut seen_keys = HashSet::<String>::new();

    let push_status = |ordered_statuses: &mut Vec<ProjectStatusConfigData>,
                       seen_keys: &mut HashSet<String>,
                       status: ProjectStatusConfigData| {
        let key = normalize_status_key(&status.name);
        if key.is_empty() || seen_keys.contains(&key) {
            return;
        }
        seen_keys.insert(key);
        ordered_statuses.push(status);
    };

    if configured_statuses.is_empty() {
        for name in ["To do", "In progress", "In review", "Done", "Cancelled"] {
            push_status(
                &mut ordered_statuses,
                &mut seen_keys,
                ProjectStatusConfigData {
                    id: status_id_from_name(name),
                    name: name.to_string(),
                    color: status_color(name).to_string(),
                    hidden: status_hidden(name),
                    sort_order: status_sort_order(name),
                },
            );
        }
    } else {
        let mut configured = configured_statuses.to_vec();
        configured.sort_by(|left, right| {
            left.sort_order
                .cmp(&right.sort_order)
                .then_with(|| left.name.cmp(&right.name))
        });
        for status in configured {
            push_status(&mut ordered_statuses, &mut seen_keys, status);
        }
    }

    for task in tasks {
        let status_name = extract_status_name(task.description.as_deref(), &task.status);
        let next_sort_order = ordered_statuses.len() as i64;
        push_status(
            &mut ordered_statuses,
            &mut seen_keys,
            ProjectStatusConfigData {
                id: status_id_from_name(&status_name),
                name: status_name.clone(),
                color: status_color(&status_name).to_string(),
                hidden: status_hidden(&status_name),
                sort_order: next_sort_order,
            },
        );
    }

    ordered_statuses
        .into_iter()
        .enumerate()
        .map(|(idx, status)| CompatProjectStatus {
            id: status.id,
            project_id: project_id.to_string(),
            name: status.name,
            color: status.color,
            sort_order: idx as i64,
            hidden: status.hidden,
            created_at: created_at.clone(),
        })
        .collect()
}

fn resolve_status_name(
    project_id: Uuid,
    tasks: &[LocalTaskRow],
    configured_statuses: &[ProjectStatusConfigData],
    status_id: &str,
    fallback_status: Option<&TaskStatus>,
) -> String {
    let statuses = compat_statuses(project_id, tasks, configured_statuses);
    if let Some(status) = statuses.iter().find(|status| status.id == status_id) {
        return status.name.clone();
    }

    let normalized = normalize_status_key(status_id);
    if let Some(status) = statuses
        .iter()
        .find(|status| normalize_status_key(&status.name) == normalized)
    {
        return status.name.clone();
    }

    fallback_status
        .map(task_status_name)
        .map(str::to_string)
        .unwrap_or_else(|| canonical_status_name(status_id))
}

async fn load_project_status_configs(
    deployment: &DeploymentImpl,
    project_id: Uuid,
) -> Result<Vec<ProjectStatusConfigData>, ApiError> {
    let Some(scratch) = Scratch::find_by_id(
        &deployment.db().pool,
        project_id,
        &ScratchType::ProjectRepoDefaults,
    )
    .await?
    else {
        return Ok(Vec::new());
    };

    let ScratchPayload::ProjectRepoDefaults(data) = scratch.payload else {
        return Ok(Vec::new());
    };

    Ok(data.statuses)
}

fn trim_matching_wrappers(value: &str, wrapper: char) -> &str {
    value
        .strip_prefix(wrapper)
        .and_then(|inner| inner.strip_suffix(wrapper))
        .unwrap_or(value)
}

fn extract_cloud_metadata_value(description: Option<&str>, key: &str) -> Option<String> {
    let prefix = format!("- {key}:");
    description.unwrap_or_default().lines().find_map(|line| {
        let value = line.trim().strip_prefix(&prefix)?.trim();
        if value.is_empty() {
            return None;
        }
        let value = trim_matching_wrappers(trim_matching_wrappers(value, '`'), '"').trim();
        if value.is_empty() {
            None
        } else {
            Some(value.to_string())
        }
    })
}

fn extract_simple_id(
    title: &str,
    description: Option<&str>,
    issue_number: i64,
) -> (String, String, i64) {
    if let Some(simple_id) = extract_cloud_metadata_value(description, "Original Cloud Issue ID") {
        let display_title = title
            .strip_prefix(&format!("{simple_id} · "))
            .unwrap_or(title)
            .trim()
            .to_string();
        let parsed_number = simple_id
            .split_once('-')
            .and_then(|(_, suffix)| suffix.parse::<i64>().ok())
            .unwrap_or(issue_number);
        return (simple_id, display_title, parsed_number);
    }

    if let Some((prefix, rest)) = title.split_once('·') {
        let simple_id = prefix.trim().to_string();
        let parsed_number = simple_id
            .split_once('-')
            .and_then(|(_, suffix)| suffix.parse::<i64>().ok())
            .unwrap_or(issue_number);
        return (simple_id, rest.trim().to_string(), parsed_number);
    }

    (format!("T{issue_number}"), title.to_string(), issue_number)
}

fn extract_priority(description: Option<&str>) -> Option<String> {
    let raw = extract_cloud_metadata_value(description, "Original Priority")?;
    match raw.to_ascii_lowercase().as_str() {
        "urgent" => Some("urgent".to_string()),
        "high" => Some("high".to_string()),
        "medium" => Some("medium".to_string()),
        "low" => Some("low".to_string()),
        _ => None,
    }
}

fn parse_pr_metadata(task: &LocalTaskRow) -> Option<CompatPullRequest> {
    let description = task.description.as_deref();
    let pr_value = extract_cloud_metadata_value(description, "PR")?;
    let mut parts = pr_value.split_whitespace();
    let number_part = parts.next()?;
    let number = number_part.trim_start_matches('#').parse::<i64>().ok()?;
    let url = parts.next().unwrap_or_default().to_string();
    let status = match extract_cloud_metadata_value(description, "PR state")
        .unwrap_or_else(|| "OPEN".to_string())
        .to_ascii_lowercase()
        .as_str()
    {
        "merged" => "merged",
        "closed" => "closed",
        _ => "open",
    }
    .to_string();
    let target_branch_name = extract_cloud_metadata_value(description, "PR base/head")
        .and_then(|value| {
            value
                .split("<-")
                .next()
                .map(|left| trim_matching_wrappers(left.trim(), '`').trim().to_string())
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "main".to_string());

    Some(CompatPullRequest {
        id: format!("imported-pr:{}", task.id),
        url,
        number,
        status,
        merged_at: None,
        merge_commit_sha: None,
        target_branch_name,
        project_id: task.project_id.to_string(),
        issue_id: task.id.to_string(),
        workspace_id: None,
        created_at: task.created_at.to_rfc3339(),
        updated_at: task.updated_at.to_rfc3339(),
    })
}

fn task_to_issue(task: LocalTaskRow, issue_number: i64, status_id: String) -> CompatIssue {
    let (simple_id, title, parsed_issue_number) =
        extract_simple_id(&task.title, task.description.as_deref(), issue_number);
    let priority = extract_priority(task.description.as_deref());
    CompatIssue {
        id: task.id.to_string(),
        project_id: task.project_id.to_string(),
        issue_number: parsed_issue_number,
        simple_id,
        status_id,
        title,
        description: task.description,
        priority,
        start_date: None,
        target_date: None,
        completed_at: None,
        sort_order: issue_number,
        parent_issue_id: None,
        parent_issue_sort_order: None,
        extension_metadata: serde_json::Value::Null,
        creator_user_id: None,
        created_at: task.created_at.to_rfc3339(),
        updated_at: task.updated_at.to_rfc3339(),
    }
}

fn synthetic_issue_prefix(workspace: &Workspace) -> String {
    if let Some(name) = workspace.name.as_deref() {
        if let Some((prefix, _)) = name.split_once("::") {
            let trimmed = prefix.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    let mut prefix = String::new();
    for segment in workspace
        .branch
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|segment| !segment.is_empty())
    {
        if let Some(first) = segment.chars().next() {
            prefix.push(first.to_ascii_uppercase());
        }
        if prefix.len() >= 3 {
            break;
        }
    }

    if prefix.is_empty() {
        "WS".to_string()
    } else {
        prefix
    }
}

fn workspace_to_issue(project_id: Uuid, workspace: &Workspace, issue_number: i64) -> CompatIssue {
    workspace_to_issue_with_pr_state(project_id, workspace, issue_number, None)
}

fn workspace_to_issue_with_pr_state(
    project_id: Uuid,
    workspace: &Workspace,
    issue_number: i64,
    pr_state: Option<&SyntheticWorkspacePrState>,
) -> CompatIssue {
    let status_id = if pr_state.is_some_and(|state| state.has_open_pr) {
        "in_review"
    } else if workspace.archived || pr_state.and_then(|state| state.latest_merged_at).is_some() {
        "done"
    } else {
        "in_progress"
    };

    let completed_at = if workspace.archived {
        Some(workspace.updated_at.to_rfc3339())
    } else {
        pr_state
            .and_then(|state| state.latest_merged_at)
            .map(|ts| ts.to_rfc3339())
    };

    CompatIssue {
        id: workspace.id.to_string(),
        project_id: project_id.to_string(),
        issue_number,
        simple_id: format!("{}-{issue_number}", synthetic_issue_prefix(workspace)),
        status_id: status_id.to_string(),
        title: workspace
            .name
            .clone()
            .unwrap_or_else(|| workspace.branch.clone()),
        description: None,
        priority: None,
        start_date: None,
        target_date: None,
        completed_at,
        sort_order: issue_number,
        parent_issue_id: None,
        parent_issue_sort_order: None,
        extension_metadata: serde_json::Value::Null,
        creator_user_id: None,
        created_at: workspace.created_at.to_rfc3339(),
        updated_at: workspace.updated_at.to_rfc3339(),
    }
}

fn should_expose_synthetic_workspace(workspace: &Workspace) -> bool {
    let Some(name) = workspace.name.as_deref() else {
        return true;
    };

    let normalized = name.trim().to_ascii_lowercase();
    normalized != "fr::staging check" && normalized != "staging check"
}

fn pull_request_status(pr_status: &db::models::merge::MergeStatus) -> String {
    match pr_status {
        db::models::merge::MergeStatus::Merged => "merged",
        db::models::merge::MergeStatus::Closed => "closed",
        _ => "open",
    }
    .to_string()
}

fn synthetic_project_from_repos(
    scratch: &Scratch,
    repos: &[Repo],
) -> Option<SyntheticProjectContext> {
    let Some(primary_repo) = repos.first() else {
        return None;
    };

    Some(SyntheticProjectContext {
        project: Project {
            id: scratch.id,
            name: primary_repo.display_name.clone(),
            archived: false,
            default_agent_working_dir: primary_repo.default_working_dir.clone(),
            remote_project_id: None,
            created_at: scratch.created_at,
            updated_at: scratch.updated_at,
        },
        repo_ids: repos.iter().map(|repo| repo.id).collect(),
    })
}

async fn list_synthetic_project_contexts(
    deployment: &DeploymentImpl,
) -> Result<Vec<SyntheticProjectContext>, ApiError> {
    let scratches = Scratch::find_all(&deployment.db().pool).await?;
    let mut contexts = Vec::new();

    for scratch in scratches {
        let repo_ids = match &scratch.payload {
            ScratchPayload::ProjectRepoDefaults(data) => data
                .repos
                .iter()
                .map(|repo| repo.repo_id)
                .collect::<Vec<_>>(),
            _ => continue,
        };

        if repo_ids.is_empty() {
            continue;
        }

        let repos = Repo::find_by_ids(&deployment.db().pool, &repo_ids).await?;
        if let Some(context) = synthetic_project_from_repos(&scratch, &repos) {
            contexts.push(context);
        }
    }

    contexts.sort_by(|left, right| {
        right
            .project
            .updated_at
            .cmp(&left.project.updated_at)
            .then_with(|| left.project.name.cmp(&right.project.name))
    });

    Ok(contexts)
}

async fn find_exact_synthetic_project_context(
    deployment: &DeploymentImpl,
    project_id: Uuid,
) -> Result<Option<SyntheticProjectContext>, ApiError> {
    let Some(scratch) = Scratch::find_by_id(
        &deployment.db().pool,
        project_id,
        &ScratchType::ProjectRepoDefaults,
    )
    .await?
    else {
        return Ok(None);
    };

    let repo_ids = match &scratch.payload {
        ScratchPayload::ProjectRepoDefaults(data) => data
            .repos
            .iter()
            .map(|repo| repo.repo_id)
            .collect::<Vec<_>>(),
        _ => return Ok(None),
    };
    if repo_ids.is_empty() {
        return Ok(None);
    }

    let repos = Repo::find_by_ids(&deployment.db().pool, &repo_ids).await?;
    Ok(synthetic_project_from_repos(&scratch, &repos))
}

async fn find_named_synthetic_project_context(
    deployment: &DeploymentImpl,
    project_name: &str,
) -> Result<Option<SyntheticProjectContext>, ApiError> {
    let target_name = normalize_project_name(project_name);
    let contexts = list_synthetic_project_contexts(deployment).await?;
    Ok(contexts
        .into_iter()
        .find(|context| normalize_project_name(&context.project.name) == target_name))
}

async fn find_related_synthetic_project_context(
    deployment: &DeploymentImpl,
    project_id: Uuid,
) -> Result<Option<SyntheticProjectContext>, ApiError> {
    if let Some(context) = find_exact_synthetic_project_context(deployment, project_id).await? {
        return Ok(Some(context));
    }

    let project = match Project::find_by_id(&deployment.db().pool, project_id).await {
        Ok(project) => project,
        Err(sqlx::Error::RowNotFound) => return Ok(None),
        Err(error) => return Err(error.into()),
    };

    find_named_synthetic_project_context(deployment, &project.name).await
}

async fn load_project_tasks(
    deployment: &DeploymentImpl,
    project_id: Uuid,
) -> Result<Vec<LocalTaskRow>, ApiError> {
    Ok(sqlx::query_as::<_, LocalTaskRow>(
        r#"SELECT id, project_id, title, description, status, parent_workspace_id, created_at, updated_at
           FROM tasks
           WHERE project_id = ?
           ORDER BY created_at ASC"#,
    )
    .bind(project_id)
    .fetch_all(&deployment.db().pool)
    .await?)
}

async fn load_synthetic_workspaces(
    deployment: &DeploymentImpl,
    repo_ids: &HashSet<Uuid>,
) -> Result<Vec<Workspace>, ApiError> {
    if repo_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut query = QueryBuilder::<Sqlite>::new(
        "SELECT DISTINCT w.id, w.task_id, w.container_ref, w.branch, w.setup_completed_at, w.created_at, w.updated_at, w.archived, w.pinned, w.name, w.worktree_deleted FROM workspaces w JOIN workspace_repos wr ON wr.workspace_id = w.id WHERE wr.repo_id IN (",
    );
    {
        let mut separated = query.separated(", ");
        for repo_id in repo_ids {
            separated.push_bind(repo_id);
        }
    }
    query.push(") ORDER BY w.created_at ASC, w.updated_at ASC");

    Ok(query
        .build_query_as::<Workspace>()
        .fetch_all(&deployment.db().pool)
        .await?
        .into_iter()
        .filter(should_expose_synthetic_workspace)
        .collect())
}

async fn load_synthetic_pr_states(
    deployment: &DeploymentImpl,
    workspaces: &[Workspace],
) -> Result<HashMap<Uuid, SyntheticWorkspacePrState>, ApiError> {
    let workspace_ids = workspaces
        .iter()
        .map(|workspace| workspace.id)
        .collect::<HashSet<_>>();
    if workspace_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut states = HashMap::<Uuid, SyntheticWorkspacePrState>::new();
    for pr in PullRequest::find_all_with_workspace(&deployment.db().pool).await? {
        let Some(workspace_id) = pr.workspace_id else {
            continue;
        };
        if !workspace_ids.contains(&workspace_id) {
            continue;
        }

        let state = states.entry(workspace_id).or_default();
        match pr.pr_status {
            db::models::merge::MergeStatus::Open => {
                state.has_open_pr = true;
            }
            db::models::merge::MergeStatus::Merged => {
                if state
                    .latest_merged_at
                    .map(|existing| pr.merged_at.unwrap_or(existing) > existing)
                    .unwrap_or(pr.merged_at.is_some())
                {
                    state.latest_merged_at = pr.merged_at;
                }
            }
            db::models::merge::MergeStatus::Closed => {}
            db::models::merge::MergeStatus::Unknown => {}
        }
    }

    Ok(states)
}

async fn ensure_mutable_issue(deployment: &DeploymentImpl, issue_id: Uuid) -> Result<(), ApiError> {
    if Task::find_by_id(&deployment.db().pool, issue_id)
        .await?
        .is_some()
    {
        return Ok(());
    }

    if Workspace::find_by_id(&deployment.db().pool, issue_id)
        .await?
        .is_some()
    {
        return Err(ApiError::BadRequest(
            "Workspace-backed issues are read-only in local mode".to_string(),
        ));
    }

    Err(sqlx::Error::RowNotFound.into())
}

async fn find_linked_workspaces_for_task(
    deployment: &DeploymentImpl,
    task_id: Uuid,
) -> Result<Vec<Workspace>, ApiError> {
    Ok(sqlx::query_as!(
        Workspace,
        r#"SELECT  id                AS "id!: Uuid",
                   task_id           AS "task_id: Uuid",
                   container_ref,
                   branch,
                   setup_completed_at AS "setup_completed_at: DateTime<Utc>",
                   created_at        AS "created_at!: DateTime<Utc>",
                   updated_at        AS "updated_at!: DateTime<Utc>",
                   archived          AS "archived!: bool",
                   pinned            AS "pinned!: bool",
                   name,
                   worktree_deleted  AS "worktree_deleted!: bool"
           FROM workspaces
           WHERE task_id = ?"#,
        task_id
    )
    .fetch_all(&deployment.db().pool)
    .await?)
}

async fn archive_linked_workspaces_for_in_staging_issue(
    deployment: &DeploymentImpl,
    issue_id: Uuid,
) -> Result<(), ApiError> {
    let workspaces = find_linked_workspaces_for_task(deployment, issue_id).await?;

    for workspace in workspaces {
        if !workspace.archived
            && let Err(e) = deployment.container().archive_workspace(workspace.id).await
        {
            tracing::error!(
                "Failed to archive workspace {} after moving issue {} to In Staging: {}",
                workspace.id,
                issue_id,
                e
            );
            continue;
        }

        if let Err(e) = deployment
            .container()
            .maybe_delete_archived_worktree_if_safe(workspace.id)
            .await
        {
            tracing::error!(
                "Failed to delete archived worktree for workspace {} after moving issue {} to In Staging: {}",
                workspace.id,
                issue_id,
                e
            );
        }
    }

    Ok(())
}

async fn list_fallback_projects(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<serde_json::Value>, ApiError> {
    let mut projects = Project::find_all(&deployment.db().pool).await?;
    let synthetic_contexts = list_synthetic_project_contexts(&deployment).await?;
    let synthetic_by_name = synthetic_contexts
        .iter()
        .map(|context| {
            (
                normalize_project_name(&context.project.name),
                context.project.clone(),
            )
        })
        .collect::<HashMap<_, _>>();

    for project in &mut projects {
        if let Some(synthetic_project) =
            synthetic_by_name.get(&normalize_project_name(&project.name))
        {
            if project.default_agent_working_dir.is_none() {
                project.default_agent_working_dir =
                    synthetic_project.default_agent_working_dir.clone();
            }
        }
    }

    Ok(ResponseJson(json!({ "projects": projects })))
}

async fn list_fallback_project_statuses(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<serde_json::Value>, ApiError> {
    let tasks = load_project_tasks(&deployment, query.project_id).await?;
    let configured_statuses = load_project_status_configs(&deployment, query.project_id).await?;
    Ok(ResponseJson(json!({
        "project_statuses": compat_statuses(query.project_id, &tasks, &configured_statuses),
    })))
}

async fn list_fallback_issues(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<serde_json::Value>, ApiError> {
    let tasks = load_project_tasks(&deployment, query.project_id).await?;
    if !tasks.is_empty() {
        let configured_statuses =
            load_project_status_configs(&deployment, query.project_id).await?;
        let statuses = compat_statuses(query.project_id, &tasks, &configured_statuses);
        let status_ids_by_key = statuses
            .iter()
            .map(|status| (normalize_status_key(&status.name), status.id.clone()))
            .collect::<HashMap<_, _>>();
        let issues = tasks
            .into_iter()
            .enumerate()
            .map(|(idx, task)| {
                let status_name = extract_status_name(task.description.as_deref(), &task.status);
                let status_id = status_ids_by_key
                    .get(&normalize_status_key(&status_name))
                    .cloned()
                    .unwrap_or_else(|| task_status_id(&task.status).to_string());
                task_to_issue(task, idx as i64 + 1, status_id)
            })
            .collect::<Vec<_>>();
        return Ok(ResponseJson(json!({ "issues": issues })));
    }

    let Some(context) =
        find_related_synthetic_project_context(&deployment, query.project_id).await?
    else {
        return Ok(ResponseJson(json!({ "issues": Vec::<CompatIssue>::new() })));
    };

    let workspaces = load_synthetic_workspaces(&deployment, &context.repo_ids).await?;
    let pr_states = load_synthetic_pr_states(&deployment, &workspaces).await?;
    let issues = workspaces
        .into_iter()
        .enumerate()
        .map(|(idx, workspace)| {
            workspace_to_issue_with_pr_state(
                query.project_id,
                &workspace,
                idx as i64 + 1,
                pr_states.get(&workspace.id),
            )
        })
        .collect::<Vec<_>>();

    Ok(ResponseJson(json!({ "issues": issues })))
}

async fn list_fallback_empty(table: &'static str) -> ResponseJson<serde_json::Value> {
    ResponseJson(json!({ table: [] }))
}

async fn list_fallback_project_workspaces(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<serde_json::Value>, ApiError> {
    let tasks = Task::find_by_project(&deployment.db().pool, query.project_id).await?;
    if !tasks.is_empty() {
        let task_ids = tasks
            .into_iter()
            .map(|task| task.id)
            .collect::<HashSet<_>>();
        let workspaces = Workspace::fetch_all(&deployment.db().pool)
            .await?
            .into_iter()
            .filter(|workspace| {
                workspace
                    .task_id
                    .map(|task_id| task_ids.contains(&task_id))
                    .unwrap_or(false)
            })
            .map(|workspace| CompatWorkspace {
                id: workspace.id.to_string(),
                project_id: query.project_id.to_string(),
                owner_user_id: String::new(),
                issue_id: workspace.task_id.map(|task_id| task_id.to_string()),
                local_workspace_id: Some(workspace.id.to_string()),
                name: workspace.name,
                archived: workspace.archived,
                files_changed: Some(0),
                lines_added: Some(0),
                lines_removed: Some(0),
                created_at: workspace.created_at.to_rfc3339(),
                updated_at: workspace.updated_at.to_rfc3339(),
            })
            .collect::<Vec<_>>();

        return Ok(ResponseJson(json!({ "workspaces": workspaces })));
    }

    let Some(context) =
        find_related_synthetic_project_context(&deployment, query.project_id).await?
    else {
        return Ok(ResponseJson(
            json!({ "workspaces": Vec::<CompatWorkspace>::new() }),
        ));
    };

    let workspaces = load_synthetic_workspaces(&deployment, &context.repo_ids)
        .await?
        .into_iter()
        .map(|workspace| CompatWorkspace {
            id: workspace.id.to_string(),
            project_id: query.project_id.to_string(),
            owner_user_id: String::new(),
            issue_id: Some(workspace.id.to_string()),
            local_workspace_id: Some(workspace.id.to_string()),
            name: workspace.name,
            archived: workspace.archived,
            files_changed: Some(0),
            lines_added: Some(0),
            lines_removed: Some(0),
            created_at: workspace.created_at.to_rfc3339(),
            updated_at: workspace.updated_at.to_rfc3339(),
        })
        .collect::<Vec<_>>();

    Ok(ResponseJson(json!({ "workspaces": workspaces })))
}

async fn list_fallback_pull_requests(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<serde_json::Value>, ApiError> {
    let task_rows = load_project_tasks(&deployment, query.project_id).await?;
    if !task_rows.is_empty() {
        let task_by_workspace = Workspace::fetch_all(&deployment.db().pool)
            .await?
            .into_iter()
            .filter_map(|workspace| workspace.task_id.map(|task_id| (workspace.id, task_id)))
            .collect::<HashMap<_, _>>();
        let project_task_ids = task_rows.iter().map(|task| task.id).collect::<HashSet<_>>();

        let mut prs = PullRequest::find_all_with_workspace(&deployment.db().pool)
            .await?
            .into_iter()
            .filter_map(|pr| {
                let workspace_id = pr.workspace_id?;
                let task_id = *task_by_workspace.get(&workspace_id)?;
                if !project_task_ids.contains(&task_id) {
                    return None;
                }
                Some(CompatPullRequest {
                    id: pr.id,
                    url: pr.pr_url,
                    number: pr.pr_number,
                    status: pull_request_status(&pr.pr_status),
                    merged_at: pr.merged_at.map(|ts| ts.to_rfc3339()),
                    merge_commit_sha: pr.merge_commit_sha,
                    target_branch_name: pr.target_branch_name,
                    project_id: query.project_id.to_string(),
                    issue_id: task_id.to_string(),
                    workspace_id: Some(workspace_id.to_string()),
                    created_at: pr.created_at.to_rfc3339(),
                    updated_at: pr.updated_at.to_rfc3339(),
                })
            })
            .collect::<Vec<_>>();

        let linked_issue_ids = prs
            .iter()
            .map(|pr| pr.issue_id.clone())
            .collect::<HashSet<_>>();
        prs.extend(
            task_rows
                .iter()
                .filter(|task| !linked_issue_ids.contains(&task.id.to_string()))
                .filter_map(parse_pr_metadata),
        );

        return Ok(ResponseJson(json!({ "pull_requests": prs })));
    }

    let Some(context) =
        find_related_synthetic_project_context(&deployment, query.project_id).await?
    else {
        return Ok(ResponseJson(
            json!({ "pull_requests": Vec::<CompatPullRequest>::new() }),
        ));
    };

    let workspace_ids = load_synthetic_workspaces(&deployment, &context.repo_ids)
        .await?
        .into_iter()
        .map(|workspace| workspace.id)
        .collect::<HashSet<_>>();

    let prs = PullRequest::find_all_with_workspace(&deployment.db().pool)
        .await?
        .into_iter()
        .filter_map(|pr| {
            let workspace_id = pr.workspace_id?;
            if !workspace_ids.contains(&workspace_id) {
                return None;
            }
            Some(CompatPullRequest {
                id: pr.id,
                url: pr.pr_url,
                number: pr.pr_number,
                status: pull_request_status(&pr.pr_status),
                merged_at: pr.merged_at.map(|ts| ts.to_rfc3339()),
                merge_commit_sha: pr.merge_commit_sha,
                target_branch_name: pr.target_branch_name,
                project_id: query.project_id.to_string(),
                issue_id: workspace_id.to_string(),
                workspace_id: Some(workspace_id.to_string()),
                created_at: pr.created_at.to_rfc3339(),
                updated_at: pr.updated_at.to_rfc3339(),
            })
        })
        .collect::<Vec<_>>();

    Ok(ResponseJson(json!({ "pull_requests": prs })))
}

async fn list_fallback_pull_request_issues(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ProjectQuery>,
) -> Result<ResponseJson<serde_json::Value>, ApiError> {
    let task_rows = load_project_tasks(&deployment, query.project_id).await?;
    if !task_rows.is_empty() {
        let task_by_workspace = Workspace::fetch_all(&deployment.db().pool)
            .await?
            .into_iter()
            .filter_map(|workspace| workspace.task_id.map(|task_id| (workspace.id, task_id)))
            .collect::<HashMap<_, _>>();
        let project_task_ids = task_rows.iter().map(|task| task.id).collect::<HashSet<_>>();

        let mut pull_request_issues = PullRequest::find_all_with_workspace(&deployment.db().pool)
            .await?
            .into_iter()
            .filter_map(|pr| {
                let workspace_id = pr.workspace_id?;
                let task_id = *task_by_workspace.get(&workspace_id)?;
                if !project_task_ids.contains(&task_id) {
                    return None;
                }
                Some(CompatPullRequestIssue {
                    id: format!("{}:{}", pr.id, task_id),
                    pull_request_id: pr.id,
                    issue_id: task_id.to_string(),
                })
            })
            .collect::<Vec<_>>();

        let linked_issue_ids = pull_request_issues
            .iter()
            .map(|item| item.issue_id.clone())
            .collect::<HashSet<_>>();
        pull_request_issues.extend(task_rows.iter().filter_map(|task| {
            let issue_id = task.id.to_string();
            if linked_issue_ids.contains(&issue_id) {
                return None;
            }
            let pr = parse_pr_metadata(task)?;
            Some(CompatPullRequestIssue {
                id: format!("{}:{}", pr.id, issue_id),
                pull_request_id: pr.id,
                issue_id,
            })
        }));

        return Ok(ResponseJson(
            json!({ "pull_request_issues": pull_request_issues }),
        ));
    }

    let Some(context) =
        find_related_synthetic_project_context(&deployment, query.project_id).await?
    else {
        return Ok(ResponseJson(
            json!({ "pull_request_issues": Vec::<CompatPullRequestIssue>::new() }),
        ));
    };

    let workspace_ids = load_synthetic_workspaces(&deployment, &context.repo_ids)
        .await?
        .into_iter()
        .map(|workspace| workspace.id)
        .collect::<HashSet<_>>();

    let pull_request_issues = PullRequest::find_all_with_workspace(&deployment.db().pool)
        .await?
        .into_iter()
        .filter_map(|pr| {
            let workspace_id = pr.workspace_id?;
            if !workspace_ids.contains(&workspace_id) {
                return None;
            }
            Some(CompatPullRequestIssue {
                id: format!("{}:{}", pr.id, workspace_id),
                pull_request_id: pr.id,
                issue_id: workspace_id.to_string(),
            })
        })
        .collect::<Vec<_>>();

    Ok(ResponseJson(
        json!({ "pull_request_issues": pull_request_issues }),
    ))
}

async fn create_issue(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateIssueRequest>,
) -> Result<ResponseJson<MutationTxidResponse>, ApiError> {
    let has_real_project = Project::find_by_id(&deployment.db().pool, request.project_id)
        .await
        .is_ok();
    if !has_real_project
        && find_exact_synthetic_project_context(&deployment, request.project_id)
            .await?
            .is_some()
    {
        return Err(ApiError::BadRequest(
            "Synthetic local project boards are read-only for issue creation".to_string(),
        ));
    }

    let project_tasks = load_project_tasks(&deployment, request.project_id).await?;
    let configured_statuses = load_project_status_configs(&deployment, request.project_id).await?;
    let status_name = resolve_status_name(
        request.project_id,
        &project_tasks,
        &configured_statuses,
        &request.status_id,
        Some(&TaskStatus::Todo),
    );

    Task::create(
        &deployment.db().pool,
        request.project_id,
        request.title,
        ensure_status_metadata(request.description, &status_name),
        parse_task_status(&status_name),
    )
    .await?;

    Ok(ResponseJson(MutationTxidResponse {
        txid: Utc::now().timestamp_millis(),
    }))
}

async fn update_issue(
    State(deployment): State<DeploymentImpl>,
    Path(issue_id): Path<Uuid>,
    Json(request): Json<UpdateIssueRequest>,
) -> Result<ResponseJson<MutationTxidResponse>, ApiError> {
    ensure_mutable_issue(&deployment, issue_id).await?;

    let existing = Task::find_by_id(&deployment.db().pool, issue_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let project_tasks = load_project_tasks(&deployment, existing.project_id).await?;
    let configured_statuses = load_project_status_configs(&deployment, existing.project_id).await?;
    let previous_status_name =
        extract_status_name(existing.description.as_deref(), &existing.status);
    let status_name = request
        .status_id
        .as_deref()
        .map(|status_id| {
            resolve_status_name(
                existing.project_id,
                &project_tasks,
                &configured_statuses,
                status_id,
                Some(&existing.status),
            )
        })
        .unwrap_or_else(|| previous_status_name.clone());
    let next_description_source = request
        .description
        .clone()
        .unwrap_or(existing.description.clone());
    let entered_in_staging =
        !is_in_staging_status(&previous_status_name) && is_in_staging_status(&status_name);

    Task::update(
        &deployment.db().pool,
        issue_id,
        request.title,
        Some(ensure_status_metadata(
            next_description_source,
            &status_name,
        )),
        Some(parse_task_status(&status_name)),
        request.parent_issue_id,
    )
    .await?;

    if entered_in_staging {
        archive_linked_workspaces_for_in_staging_issue(&deployment, issue_id).await?;
    }

    Ok(ResponseJson(MutationTxidResponse {
        txid: Utc::now().timestamp_millis(),
    }))
}

async fn bulk_update_issues(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<BulkIssueUpdateRequest>,
) -> Result<ResponseJson<MutationTxidResponse>, ApiError> {
    for update in request.updates {
        ensure_mutable_issue(&deployment, update.id).await?;

        let existing = Task::find_by_id(&deployment.db().pool, update.id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;
        let project_tasks = load_project_tasks(&deployment, existing.project_id).await?;
        let configured_statuses =
            load_project_status_configs(&deployment, existing.project_id).await?;
        let previous_status_name =
            extract_status_name(existing.description.as_deref(), &existing.status);
        let status_name = update
            .status_id
            .as_deref()
            .map(|status_id| {
                resolve_status_name(
                    existing.project_id,
                    &project_tasks,
                    &configured_statuses,
                    status_id,
                    Some(&existing.status),
                )
            })
            .unwrap_or_else(|| previous_status_name.clone());
        let next_description_source = update
            .description
            .clone()
            .unwrap_or(existing.description.clone());
        let entered_in_staging =
            !is_in_staging_status(&previous_status_name) && is_in_staging_status(&status_name);

        Task::update(
            &deployment.db().pool,
            update.id,
            update.title,
            Some(ensure_status_metadata(
                next_description_source,
                &status_name,
            )),
            Some(parse_task_status(&status_name)),
            update.parent_issue_id,
        )
        .await?;

        if entered_in_staging {
            archive_linked_workspaces_for_in_staging_issue(&deployment, update.id).await?;
        }
    }

    Ok(ResponseJson(MutationTxidResponse {
        txid: Utc::now().timestamp_millis(),
    }))
}

async fn delete_issue(
    State(deployment): State<DeploymentImpl>,
    Path(issue_id): Path<Uuid>,
) -> Result<ResponseJson<MutationTxidResponse>, ApiError> {
    ensure_mutable_issue(&deployment, issue_id).await?;
    Task::delete(&deployment.db().pool, issue_id).await?;
    Ok(ResponseJson(MutationTxidResponse {
        txid: Utc::now().timestamp_millis(),
    }))
}

async fn get_project(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    let project = match Project::find_by_id(&deployment.db().pool, project_id).await {
        Ok(mut project) => {
            if let Some(context) =
                find_named_synthetic_project_context(&deployment, &project.name).await?
            {
                if project.default_agent_working_dir.is_none() {
                    project.default_agent_working_dir = context.project.default_agent_working_dir;
                }
            }
            project
        }
        Err(sqlx::Error::RowNotFound) => {
            find_exact_synthetic_project_context(&deployment, project_id)
                .await?
                .map(|context| context.project)
                .ok_or(sqlx::Error::RowNotFound)?
        }
        Err(error) => return Err(error.into()),
    };

    Ok(ResponseJson(ApiResponse::success(project)))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/projects/{project_id}", get(get_project))
        .route("/fallback/projects", get(list_fallback_projects))
        .route(
            "/fallback/project_statuses",
            get(list_fallback_project_statuses),
        )
        .route("/fallback/issues", get(list_fallback_issues))
        .route(
            "/fallback/project_workspaces",
            get(list_fallback_project_workspaces),
        )
        .route(
            "/fallback/tags",
            get(|| async { list_fallback_empty("tags").await }),
        )
        .route(
            "/fallback/issue_assignees",
            get(|| async { list_fallback_empty("issue_assignees").await }),
        )
        .route(
            "/fallback/issue_followers",
            get(|| async { list_fallback_empty("issue_followers").await }),
        )
        .route(
            "/fallback/issue_tags",
            get(|| async { list_fallback_empty("issue_tags").await }),
        )
        .route(
            "/fallback/issue_relationships",
            get(|| async { list_fallback_empty("issue_relationships").await }),
        )
        .route(
            "/fallback/pull_request_issues",
            get(list_fallback_pull_request_issues),
        )
        .route("/fallback/pull_requests", get(list_fallback_pull_requests))
        .route("/issues", post(create_issue))
        .route("/issues/bulk", post(bulk_update_issues))
        .route(
            "/issues/{issue_id}",
            patch(update_issue).delete(delete_issue),
        )
}
