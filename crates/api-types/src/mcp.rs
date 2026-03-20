use std::collections::HashMap;

use schemars::JsonSchema;
use serde::Serialize;
use uuid::Uuid;

use crate::{
    Issue, IssuePriority, IssueSortField, OrganizationMemberWithProfile, OrganizationWithRole,
    Project, PullRequestStatus, SortDirection,
};

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, JsonSchema)]
pub struct McpOrganizationSummary {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub is_personal: bool,
    pub role: String,
}

impl McpOrganizationSummary {
    pub fn from_org_with_role(org: OrganizationWithRole) -> Self {
        Self {
            id: org.id.to_string(),
            name: org.name,
            slug: org.slug,
            is_personal: org.is_personal,
            role: format!("{:?}", org.user_role).to_uppercase(),
        }
    }
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct McpListOrganizationsResponse {
    pub organizations: Vec<McpOrganizationSummary>,
    pub count: usize,
}

// ---------------------------------------------------------------------------
// Organization members
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, JsonSchema)]
pub struct McpOrganizationMemberSummary {
    pub user_id: String,
    pub role: String,
    pub joined_at: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

impl McpOrganizationMemberSummary {
    pub fn from_member_with_profile(member: OrganizationMemberWithProfile) -> Self {
        Self {
            user_id: member.user_id.to_string(),
            role: format!("{:?}", member.role).to_uppercase(),
            joined_at: member.joined_at.to_rfc3339(),
            first_name: member.first_name,
            last_name: member.last_name,
            username: member.username,
            email: member.email,
            avatar_url: member.avatar_url,
        }
    }
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct McpListOrgMembersResponse {
    pub organization_id: String,
    pub members: Vec<McpOrganizationMemberSummary>,
    pub count: usize,
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, JsonSchema)]
pub struct McpProjectSummary {
    pub id: String,
    pub organization_id: String,
    pub name: String,
    pub color: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

impl McpProjectSummary {
    pub fn from_project(project: Project) -> Self {
        Self {
            id: project.id.to_string(),
            organization_id: project.organization_id.to_string(),
            name: project.name,
            color: project.color,
            sort_order: project.sort_order,
            created_at: project.created_at.to_rfc3339(),
            updated_at: project.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct McpListProjectsResponse {
    pub organization_id: String,
    pub projects: Vec<McpProjectSummary>,
    pub count: usize,
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, JsonSchema)]
pub struct McpIssueSummary {
    pub id: String,
    pub project_id: String,
    pub simple_id: String,
    pub title: String,
    pub status: String,
    pub priority: Option<String>,
    pub parent_issue_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub pull_request_count: Option<usize>,
    pub latest_pr_url: Option<String>,
    pub latest_pr_status: Option<PullRequestStatus>,
}

impl McpIssueSummary {
    pub fn from_issue(issue: Issue, status_name: &str) -> Self {
        Self {
            id: issue.id.to_string(),
            project_id: issue.project_id.to_string(),
            simple_id: issue.simple_id,
            title: issue.title,
            status: status_name.to_string(),
            priority: issue.priority.map(priority_label),
            parent_issue_id: issue.parent_issue_id.map(|id| id.to_string()),
            created_at: issue.created_at.to_rfc3339(),
            updated_at: issue.updated_at.to_rfc3339(),
            pull_request_count: None,
            latest_pr_url: None,
            latest_pr_status: None,
        }
    }
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct McpIssueDetails {
    pub id: String,
    pub project_id: String,
    pub simple_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub status_id: String,
    pub priority: Option<String>,
    pub parent_issue_id: Option<String>,
    pub start_date: Option<String>,
    pub target_date: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl McpIssueDetails {
    pub fn from_issue(issue: Issue, status_name: &str) -> Self {
        Self {
            id: issue.id.to_string(),
            project_id: issue.project_id.to_string(),
            simple_id: issue.simple_id,
            title: issue.title,
            description: issue.description,
            status: status_name.to_string(),
            status_id: issue.status_id.to_string(),
            priority: issue.priority.map(priority_label),
            parent_issue_id: issue.parent_issue_id.map(|id| id.to_string()),
            start_date: issue.start_date.map(|d| d.to_rfc3339()),
            target_date: issue.target_date.map(|d| d.to_rfc3339()),
            completed_at: issue.completed_at.map(|d| d.to_rfc3339()),
            created_at: issue.created_at.to_rfc3339(),
            updated_at: issue.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct McpListIssuesResponse {
    pub project_id: String,
    pub total_count: usize,
    pub returned_count: usize,
    pub limit: usize,
    pub offset: usize,
    pub issues: Vec<McpIssueSummary>,
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

pub fn priority_label(priority: IssuePriority) -> String {
    match priority {
        IssuePriority::Urgent => "urgent",
        IssuePriority::High => "high",
        IssuePriority::Medium => "medium",
        IssuePriority::Low => "low",
    }
    .to_string()
}

pub fn parse_priority(value: &str) -> Result<IssuePriority, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "urgent" => Ok(IssuePriority::Urgent),
        "high" => Ok(IssuePriority::High),
        "medium" => Ok(IssuePriority::Medium),
        "low" => Ok(IssuePriority::Low),
        other => Err(format!(
            "Unknown priority '{other}'. Allowed values: ['urgent', 'high', 'medium', 'low']"
        )),
    }
}

pub fn parse_sort_field(value: Option<&str>) -> Result<Option<IssueSortField>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    match value.trim().to_ascii_lowercase().as_str() {
        "sort_order" => Ok(Some(IssueSortField::SortOrder)),
        "priority" => Ok(Some(IssueSortField::Priority)),
        "created_at" => Ok(Some(IssueSortField::CreatedAt)),
        "updated_at" => Ok(Some(IssueSortField::UpdatedAt)),
        "title" => Ok(Some(IssueSortField::Title)),
        other => Err(format!(
            "Unknown sort_field '{other}'. Allowed values: ['sort_order', 'priority', 'created_at', 'updated_at', 'title']"
        )),
    }
}

pub fn parse_sort_direction(value: Option<&str>) -> Result<Option<SortDirection>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    match value.trim().to_ascii_lowercase().as_str() {
        "asc" => Ok(Some(SortDirection::Asc)),
        "desc" => Ok(Some(SortDirection::Desc)),
        other => Err(format!(
            "Unknown sort_direction '{other}'. Allowed values: ['asc', 'desc']"
        )),
    }
}

pub fn resolve_status_name(status_id: Uuid, statuses: &HashMap<Uuid, String>) -> String {
    statuses
        .get(&status_id)
        .cloned()
        .unwrap_or_else(|| status_id.to_string())
}
