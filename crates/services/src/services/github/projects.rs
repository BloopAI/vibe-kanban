//! GitHub Projects v2 API service.
//!
//! This module provides high-level operations for interacting with GitHub Projects v2,
//! including listing projects, fetching project items (issues), and updating item fields.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

use super::graphql::{queries, GitHubGraphQL, GitHubGraphQLError};

#[derive(Debug, Error)]
pub enum GitHubProjectsError {
    #[error(transparent)]
    GraphQL(#[from] GitHubGraphQLError),
    #[error("Project not found: {0}")]
    ProjectNotFound(String),
    #[error("Issue not found: {0}")]
    IssueNotFound(String),
    #[error("Field not found: {0}")]
    FieldNotFound(String),
}

/// Represents a GitHub Projects v2 project
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProject {
    pub id: String,
    pub title: String,
    pub number: i64,
    pub url: String,
    pub closed: bool,
    pub short_description: Option<String>,
    pub public: bool,
    pub owner_login: String,
}

/// Represents a GitHub Issue
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssue {
    pub id: String,
    pub number: i64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub closed_at: Option<DateTime<Utc>>,
    pub author_login: Option<String>,
    pub assignees: Vec<String>,
    pub labels: Vec<GitHubLabel>,
    pub milestone: Option<GitHubMilestone>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitHubLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitHubMilestone {
    pub id: String,
    pub title: String,
    pub number: i64,
}

/// Project item with field values
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectItem {
    pub id: String,
    pub issue: Option<GitHubIssue>,
    pub field_values: Vec<ProjectFieldValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFieldValue {
    pub field_name: String,
    pub value: String,
}

/// Project field definition
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectField {
    pub id: String,
    pub name: String,
    pub data_type: String,
    pub options: Option<Vec<ProjectFieldOption>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ProjectFieldOption {
    pub id: String,
    pub name: String,
}

// Response types for GraphQL queries
#[derive(Debug, Deserialize)]
struct ViewerResponse {
    viewer: ViewerData,
}

#[derive(Debug, Deserialize)]
struct ViewerData {
    login: String,
    id: String,
}

#[derive(Debug, Deserialize)]
struct UserProjectsResponse {
    user: Option<ProjectsOwner>,
}

#[derive(Debug, Deserialize)]
struct OrgProjectsResponse {
    organization: Option<ProjectsOwner>,
}

#[derive(Debug, Deserialize)]
struct RepoProjectsResponse {
    repository: Option<RepoProjectsOwner>,
}

#[derive(Debug, Deserialize)]
struct ProjectsOwner {
    #[serde(rename = "projectsV2")]
    projects_v2: ProjectsConnection,
}

#[derive(Debug, Deserialize)]
struct RepoProjectsOwner {
    #[serde(rename = "projectsV2")]
    projects_v2: ProjectsConnection,
}

#[derive(Debug, Deserialize)]
struct ProjectsConnection {
    #[serde(rename = "pageInfo")]
    page_info: PageInfo,
    nodes: Vec<ProjectNode>,
}

#[derive(Debug, Deserialize)]
struct PageInfo {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
    #[serde(rename = "endCursor")]
    end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProjectNode {
    id: String,
    title: String,
    number: i64,
    url: String,
    closed: bool,
    #[serde(rename = "shortDescription")]
    short_description: Option<String>,
    public: bool,
    owner: ProjectOwner,
}

#[derive(Debug, Deserialize)]
struct ProjectOwner {
    login: String,
}

#[derive(Debug, Deserialize)]
struct ProjectItemsResponse {
    node: Option<ProjectItemsNode>,
}

#[derive(Debug, Deserialize)]
struct ProjectItemsNode {
    items: ItemsConnection,
}

#[derive(Debug, Deserialize)]
struct ItemsConnection {
    #[serde(rename = "pageInfo")]
    page_info: PageInfo,
    nodes: Vec<ItemNode>,
}

#[derive(Debug, Deserialize)]
struct ItemNode {
    id: String,
    #[serde(default, deserialize_with = "deserialize_content")]
    content: Option<IssueContent>,
    #[serde(rename = "fieldValues")]
    field_values: FieldValuesConnection,
}

/// Custom deserializer that handles empty objects `{}` as None
fn deserialize_content<'de, D>(deserializer: D) -> Result<Option<IssueContent>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;

    // First try to deserialize as a generic Value
    let value = serde_json::Value::deserialize(deserializer)?;

    match value {
        serde_json::Value::Null => Ok(None),
        serde_json::Value::Object(obj) if obj.is_empty() => Ok(None),
        serde_json::Value::Object(_) => {
            // Try to deserialize as IssueContent
            serde_json::from_value(value).map(Some).map_err(D::Error::custom)
        }
        _ => Err(D::Error::custom("expected object or null for content")),
    }
}

#[derive(Debug, Deserialize)]
struct IssueContent {
    id: String,
    number: i64,
    title: String,
    body: Option<String>,
    state: String,
    url: String,
    #[serde(rename = "createdAt")]
    created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    updated_at: DateTime<Utc>,
    #[serde(rename = "closedAt")]
    closed_at: Option<DateTime<Utc>>,
    author: Option<AuthorNode>,
    assignees: AssigneesConnection,
    labels: LabelsConnection,
    milestone: Option<MilestoneNode>,
}

#[derive(Debug, Deserialize)]
struct AuthorNode {
    login: String,
}

#[derive(Debug, Deserialize)]
struct AssigneesConnection {
    nodes: Vec<AssigneeNode>,
}

#[derive(Debug, Deserialize)]
struct AssigneeNode {
    login: String,
}

#[derive(Debug, Deserialize)]
struct LabelsConnection {
    nodes: Vec<LabelNode>,
}

#[derive(Debug, Deserialize)]
struct LabelNode {
    name: String,
    color: String,
}

#[derive(Debug, Deserialize)]
struct MilestoneNode {
    id: String,
    title: String,
    number: i64,
}

#[derive(Debug, Deserialize)]
struct FieldValuesConnection {
    nodes: Vec<FieldValueNode>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum FieldValueNode {
    SingleSelect {
        name: Option<String>,
        field: Option<SingleSelectFieldRef>,
    },
    Text {
        text: Option<String>,
        field: Option<TextFieldRef>,
    },
    Date {
        date: Option<String>,
        field: Option<TextFieldRef>,
    },
    Number {
        number: Option<f64>,
        field: Option<TextFieldRef>,
    },
    Other {},
}

#[derive(Debug, Deserialize)]
struct SingleSelectFieldRef {
    name: String,
}

#[derive(Debug, Deserialize)]
struct TextFieldRef {
    name: String,
}

#[derive(Debug, Deserialize)]
struct ProjectFieldsResponse {
    node: Option<ProjectFieldsNode>,
}

#[derive(Debug, Deserialize)]
struct ProjectFieldsNode {
    fields: FieldsConnection,
}

#[derive(Debug, Deserialize)]
struct FieldsConnection {
    nodes: Vec<FieldNode>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum FieldNode {
    SingleSelect {
        id: String,
        name: String,
        options: Vec<OptionNode>,
    },
    Regular {
        id: String,
        name: String,
        #[serde(rename = "dataType")]
        data_type: Option<String>,
    },
    Iteration {
        id: String,
        name: String,
    },
}

#[derive(Debug, Deserialize)]
struct OptionNode {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct RepositoryIdResponse {
    repository: Option<RepositoryIdNode>,
}

#[derive(Debug, Deserialize)]
struct RepositoryIdNode {
    id: String,
}

pub struct GitHubProjectsService {
    pub graphql: GitHubGraphQL,
}

impl GitHubProjectsService {
    pub fn new() -> Self {
        Self {
            graphql: GitHubGraphQL::new(),
        }
    }

    /// Check if GitHub CLI is available and authenticated
    pub fn check_available(&self) -> Result<(), GitHubProjectsError> {
        self.graphql.check_available()?;
        Ok(())
    }

    /// Get the authenticated user's login
    pub fn get_viewer_login(&self) -> Result<String, GitHubProjectsError> {
        let response: ViewerResponse = self.graphql.query(queries::GET_VIEWER, None)?;
        Ok(response.viewer.login)
    }

    /// List projects for a user
    pub fn list_user_projects(&self, login: &str) -> Result<Vec<GitHubProject>, GitHubProjectsError> {
        let full_query = format!("{}\n{}", queries::PROJECT_FRAGMENT, queries::LIST_USER_PROJECTS);
        let mut projects = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let variables = serde_json::json!({
                "login": login,
                "first": 50,
                "after": cursor
            });

            let response: UserProjectsResponse = self.graphql.query(&full_query, Some(variables))?;

            let owner = response.user.ok_or_else(|| {
                GitHubProjectsError::ProjectNotFound(format!("User not found: {}", login))
            })?;

            for node in owner.projects_v2.nodes {
                projects.push(GitHubProject {
                    id: node.id,
                    title: node.title,
                    number: node.number,
                    url: node.url,
                    closed: node.closed,
                    short_description: node.short_description,
                    public: node.public,
                    owner_login: node.owner.login,
                });
            }

            if owner.projects_v2.page_info.has_next_page {
                cursor = owner.projects_v2.page_info.end_cursor;
            } else {
                break;
            }
        }

        Ok(projects)
    }

    /// List projects for an organization
    pub fn list_org_projects(&self, login: &str) -> Result<Vec<GitHubProject>, GitHubProjectsError> {
        let full_query = format!("{}\n{}", queries::PROJECT_FRAGMENT, queries::LIST_ORG_PROJECTS);
        let mut projects = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let variables = serde_json::json!({
                "login": login,
                "first": 50,
                "after": cursor
            });

            let response: OrgProjectsResponse = self.graphql.query(&full_query, Some(variables))?;

            let owner = response.organization.ok_or_else(|| {
                GitHubProjectsError::ProjectNotFound(format!("Organization not found: {}", login))
            })?;

            for node in owner.projects_v2.nodes {
                projects.push(GitHubProject {
                    id: node.id,
                    title: node.title,
                    number: node.number,
                    url: node.url,
                    closed: node.closed,
                    short_description: node.short_description,
                    public: node.public,
                    owner_login: node.owner.login,
                });
            }

            if owner.projects_v2.page_info.has_next_page {
                cursor = owner.projects_v2.page_info.end_cursor;
            } else {
                break;
            }
        }

        Ok(projects)
    }

    /// List projects for a repository
    pub fn list_repo_projects(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<Vec<GitHubProject>, GitHubProjectsError> {
        let full_query = format!("{}\n{}", queries::PROJECT_FRAGMENT, queries::LIST_REPO_PROJECTS);
        let mut projects = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let variables = serde_json::json!({
                "owner": owner,
                "repo": repo,
                "first": 50,
                "after": cursor
            });

            let response: RepoProjectsResponse = self.graphql.query(&full_query, Some(variables))?;

            let repository = response.repository.ok_or_else(|| {
                GitHubProjectsError::ProjectNotFound(format!("Repository not found: {}/{}", owner, repo))
            })?;

            for node in repository.projects_v2.nodes {
                projects.push(GitHubProject {
                    id: node.id,
                    title: node.title,
                    number: node.number,
                    url: node.url,
                    closed: node.closed,
                    short_description: node.short_description,
                    public: node.public,
                    owner_login: node.owner.login,
                });
            }

            if repository.projects_v2.page_info.has_next_page {
                cursor = repository.projects_v2.page_info.end_cursor;
            } else {
                break;
            }
        }

        Ok(projects)
    }

    /// Get project items (issues) with field values
    pub fn get_project_items(
        &self,
        project_id: &str,
    ) -> Result<Vec<GitHubProjectItem>, GitHubProjectsError> {
        let full_query = format!("{}\n{}", queries::ISSUE_FRAGMENT, queries::GET_PROJECT_ITEMS);
        let mut items = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let variables = serde_json::json!({
                "projectId": project_id,
                "first": 50,
                "after": cursor
            });

            let response: ProjectItemsResponse = self.graphql.query(&full_query, Some(variables))?;

            let node = response.node.ok_or_else(|| {
                GitHubProjectsError::ProjectNotFound(format!("Project not found: {}", project_id))
            })?;

            for item in node.items.nodes {
                let issue = item.content.map(|c| GitHubIssue {
                    id: c.id,
                    number: c.number,
                    title: c.title,
                    body: c.body,
                    state: c.state,
                    url: c.url,
                    created_at: c.created_at,
                    updated_at: c.updated_at,
                    closed_at: c.closed_at,
                    author_login: c.author.map(|a| a.login),
                    assignees: c.assignees.nodes.into_iter().map(|a| a.login).collect(),
                    labels: c.labels.nodes.into_iter().map(|l| GitHubLabel {
                        name: l.name,
                        color: l.color,
                    }).collect(),
                    milestone: c.milestone.map(|m| GitHubMilestone {
                        id: m.id,
                        title: m.title,
                        number: m.number,
                    }),
                });

                let field_values: Vec<ProjectFieldValue> = item
                    .field_values
                    .nodes
                    .into_iter()
                    .filter_map(|fv| match fv {
                        FieldValueNode::SingleSelect { name, field } => {
                            name.and_then(|n| {
                                field.map(|f| ProjectFieldValue {
                                    field_name: f.name,
                                    value: n,
                                })
                            })
                        }
                        FieldValueNode::Text { text, field } => {
                            text.and_then(|t| {
                                field.map(|f| ProjectFieldValue {
                                    field_name: f.name,
                                    value: t,
                                })
                            })
                        }
                        FieldValueNode::Date { date, field } => {
                            date.and_then(|d| {
                                field.map(|f| ProjectFieldValue {
                                    field_name: f.name,
                                    value: d,
                                })
                            })
                        }
                        FieldValueNode::Number { number, field } => {
                            number.and_then(|n| {
                                field.map(|f| ProjectFieldValue {
                                    field_name: f.name,
                                    value: n.to_string(),
                                })
                            })
                        }
                        FieldValueNode::Other {} => None,
                    })
                    .collect();

                items.push(GitHubProjectItem {
                    id: item.id,
                    issue,
                    field_values,
                });
            }

            if node.items.page_info.has_next_page {
                cursor = node.items.page_info.end_cursor;
            } else {
                break;
            }
        }

        Ok(items)
    }

    /// Get project fields (for status mapping)
    pub fn get_project_fields(
        &self,
        project_id: &str,
    ) -> Result<Vec<ProjectField>, GitHubProjectsError> {
        let variables = serde_json::json!({
            "projectId": project_id
        });

        let response: ProjectFieldsResponse =
            self.graphql.query(queries::GET_PROJECT_FIELDS, Some(variables))?;

        let node = response.node.ok_or_else(|| {
            GitHubProjectsError::ProjectNotFound(format!("Project not found: {}", project_id))
        })?;

        let fields = node
            .fields
            .nodes
            .into_iter()
            .map(|f| match f {
                FieldNode::SingleSelect { id, name, options } => ProjectField {
                    id,
                    name,
                    data_type: "SINGLE_SELECT".to_string(),
                    options: Some(
                        options
                            .into_iter()
                            .map(|o| ProjectFieldOption { id: o.id, name: o.name })
                            .collect(),
                    ),
                },
                FieldNode::Regular { id, name, data_type } => ProjectField {
                    id,
                    name,
                    data_type: data_type.unwrap_or_else(|| "TEXT".to_string()),
                    options: None,
                },
                FieldNode::Iteration { id, name } => ProjectField {
                    id,
                    name,
                    data_type: "ITERATION".to_string(),
                    options: None,
                },
            })
            .collect();

        Ok(fields)
    }

    /// Get repository ID (needed for creating issues)
    pub fn get_repository_id(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<String, GitHubProjectsError> {
        let variables = serde_json::json!({
            "owner": owner,
            "repo": repo
        });

        let response: RepositoryIdResponse =
            self.graphql.query(queries::GET_REPOSITORY_ID, Some(variables))?;

        let repository = response.repository.ok_or_else(|| {
            GitHubProjectsError::ProjectNotFound(format!("Repository not found: {}/{}", owner, repo))
        })?;

        Ok(repository.id)
    }
}

impl Default for GitHubProjectsService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_github_project_serialization() {
        let project = GitHubProject {
            id: "PVT_kwXXX".to_string(),
            title: "Test Project".to_string(),
            number: 1,
            url: "https://github.com/users/test/projects/1".to_string(),
            closed: false,
            short_description: Some("A test project".to_string()),
            public: true,
            owner_login: "test".to_string(),
        };

        let json = serde_json::to_string(&project).unwrap();
        assert!(json.contains("Test Project"));
    }
}
