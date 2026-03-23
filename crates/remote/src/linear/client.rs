use reqwest::Client;
use serde::{Deserialize, Serialize};

pub const LINEAR_API_URL: &str = "https://api.linear.app/graphql";
pub const IGNORE_LABEL_NAME: &str = "vibe-kanban-ignore";

#[derive(Debug, thiserror::Error)]
pub enum LinearClientError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("graphql error: {0}")]
    GraphQL(String),
    #[error("missing expected field in response")]
    MissingField,
}

#[derive(Debug, Serialize)]
struct GraphQLRequest<V: Serialize> {
    query: &'static str,
    variables: V,
}

#[derive(Debug, Deserialize)]
struct GraphQLResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GraphQLError>>,
}

#[derive(Debug, Deserialize)]
struct GraphQLError {
    message: String,
}

async fn gql<V: Serialize, T: for<'de> Deserialize<'de>>(
    client: &Client,
    api_key: &str,
    query: &'static str,
    variables: V,
) -> Result<T, LinearClientError> {
    let resp = client
        .post(LINEAR_API_URL)
        .bearer_auth(api_key)
        .json(&GraphQLRequest { query, variables })
        .send()
        .await?
        .json::<GraphQLResponse<T>>()
        .await?;
    if let Some(errors) = resp.errors {
        let msg = errors
            .into_iter()
            .map(|e| e.message)
            .collect::<Vec<_>>()
            .join("; ");
        return Err(LinearClientError::GraphQL(msg));
    }
    resp.data.ok_or(LinearClientError::MissingField)
}

// NOTE: gql() takes query: &'static str which means all query strings must be
// string literals. For dynamic strings (format!), use a workaround below.
async fn gql_dynamic<V: Serialize, T: for<'de> Deserialize<'de>>(
    client: &Client,
    api_key: &str,
    query: String,
    variables: V,
) -> Result<T, LinearClientError> {
    #[derive(Serialize)]
    struct Req<V: Serialize> {
        query: String,
        variables: V,
    }
    let resp = client
        .post(LINEAR_API_URL)
        .bearer_auth(api_key)
        .json(&Req { query, variables })
        .send()
        .await?
        .json::<GraphQLResponse<T>>()
        .await?;
    if let Some(errors) = resp.errors {
        let msg = errors
            .into_iter()
            .map(|e| e.message)
            .collect::<Vec<_>>()
            .join("; ");
        return Err(LinearClientError::GraphQL(msg));
    }
    resp.data.ok_or(LinearClientError::MissingField)
}

// ── Viewer ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LinearViewer {
    pub id: String,
    pub email: String,
    pub name: String,
}

pub async fn get_viewer(
    client: &Client,
    api_key: &str,
) -> Result<LinearViewer, LinearClientError> {
    #[derive(Deserialize)]
    struct Data {
        viewer: LinearViewer,
    }
    let data: Data = gql(client, api_key, "{ viewer { id email name } }", ()).await?;
    Ok(data.viewer)
}

// ── Teams ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct LinearTeam {
    pub id: String,
    pub name: String,
    pub key: String,
}

pub async fn list_teams(
    client: &Client,
    api_key: &str,
) -> Result<Vec<LinearTeam>, LinearClientError> {
    #[derive(Deserialize)]
    struct Nodes {
        nodes: Vec<LinearTeam>,
    }
    #[derive(Deserialize)]
    struct Data {
        teams: Nodes,
    }
    let data: Data = gql(
        client,
        api_key,
        "{ teams { nodes { id name key } } }",
        (),
    )
    .await?;
    Ok(data.teams.nodes)
}

// ── Workflow states ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct LinearWorkflowState {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub position: f64,
}

pub async fn list_workflow_states(
    client: &Client,
    api_key: &str,
    team_id: &str,
) -> Result<Vec<LinearWorkflowState>, LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> {
        team_id: &'a str,
    }
    #[derive(Deserialize)]
    struct Nodes {
        nodes: Vec<LinearWorkflowState>,
    }
    #[derive(Deserialize)]
    struct Team {
        states: Nodes,
    }
    #[derive(Deserialize)]
    struct Data {
        team: Team,
    }
    let data: Data = gql(
        client,
        api_key,
        "query($team_id: String!) { team(id: $team_id) { states { nodes { id name type position } } } }",
        Vars { team_id },
    )
    .await?;
    Ok(data.team.states.nodes)
}

// ── Issues ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct LinearLabel {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: i32,
    pub due_date: Option<String>,
    pub state: LinearWorkflowState,
    pub assignee: Option<LinearUser>,
    pub labels: LinearLabelConnection,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LinearLabelConnection {
    pub nodes: Vec<LinearLabel>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LinearUser {
    pub id: String,
    pub email: String,
    pub name: String,
}

impl LinearIssue {
    pub fn has_ignore_label(&self) -> bool {
        self.labels
            .nodes
            .iter()
            .any(|l| l.name.eq_ignore_ascii_case(IGNORE_LABEL_NAME))
    }
}

/// Linear issue with optional project field (used only for filtering in list_issues_page).
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueRaw {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: i32,
    pub due_date: Option<String>,
    pub state: LinearWorkflowState,
    pub assignee: Option<LinearUser>,
    pub labels: LinearLabelConnection,
    pub project: Option<LinearProjectRef>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LinearProjectRef {
    pub id: String,
}

impl LinearIssueRaw {
    pub fn has_ignore_label(&self) -> bool {
        self.labels
            .nodes
            .iter()
            .any(|l| l.name.eq_ignore_ascii_case(IGNORE_LABEL_NAME))
    }

    pub fn into_issue(self) -> LinearIssue {
        LinearIssue {
            id: self.id,
            identifier: self.identifier,
            title: self.title,
            description: self.description,
            priority: self.priority,
            due_date: self.due_date,
            state: self.state,
            assignee: self.assignee,
            labels: self.labels,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

pub async fn list_issues_page(
    client: &Client,
    api_key: &str,
    team_id: &str,
    project_id: Option<&str>,
    after: Option<&str>,
) -> Result<(Vec<LinearIssue>, bool, Option<String>), LinearClientError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Vars<'a> {
        team_id: &'a str,
        after: Option<&'a str>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct IssueConn {
        nodes: Vec<LinearIssueRaw>,
        page_info: PageInfo,
    }
    #[derive(Deserialize)]
    struct Team {
        issues: IssueConn,
    }
    #[derive(Deserialize)]
    struct Data {
        team: Team,
    }
    let data: Data = gql(
        client,
        api_key,
        r#"query($team_id: String!, $after: String) {
            team(id: $team_id) {
                issues(first: 100, after: $after) {
                    nodes { id identifier title description priority dueDate
                            state { id name type position }
                            assignee { id email name }
                            labels { nodes { id name } }
                            project { id }
                    }
                    pageInfo { hasNextPage endCursor }
                }
            }
        }"#,
        Vars { team_id, after },
    )
    .await?;
    let raw = data.team.issues.nodes;
    let filtered: Vec<LinearIssue> = raw
        .into_iter()
        .filter(|i| {
            if let Some(proj_id) = project_id {
                i.project.as_ref().map(|p| p.id.as_str()) == Some(proj_id)
            } else {
                true
            }
        })
        .map(|i| i.into_issue())
        .collect();
    Ok((
        filtered,
        data.team.issues.page_info.has_next_page,
        data.team.issues.page_info.end_cursor,
    ))
}

// ── Issue mutations ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateIssueInput<'a> {
    pub team_id: &'a str,
    pub project_id: Option<&'a str>,
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub state_id: Option<&'a str>,
    pub priority: Option<i32>,
    pub due_date: Option<&'a str>,
    pub assignee_id: Option<&'a str>,
    pub label_ids: Option<Vec<&'a str>>,
}

pub async fn create_issue(
    client: &Client,
    api_key: &str,
    input: CreateIssueInput<'_>,
) -> Result<LinearIssue, LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> {
        input: CreateIssueInput<'a>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct IssueCreate {
        issue: LinearIssue,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Data {
        issue_create: IssueCreate,
    }
    let issue_fields = "id identifier title description priority dueDate state { id name type position } assignee { id email name } labels { nodes { id name } }";
    let data: Data = gql_dynamic(
        client,
        api_key,
        format!("mutation($input: IssueCreateInput!) {{ issueCreate(input: $input) {{ issue {{ {issue_fields} }} }} }}"),
        Vars { input },
    )
    .await?;
    Ok(data.issue_create.issue)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateIssueInput<'a> {
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub state_id: Option<&'a str>,
    pub priority: Option<i32>,
    pub due_date: Option<&'a str>,
    pub assignee_id: Option<&'a str>,
    pub label_ids: Option<Vec<String>>,
}

pub async fn update_issue(
    client: &Client,
    api_key: &str,
    issue_id: &str,
    input: UpdateIssueInput<'_>,
) -> Result<(), LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> {
        id: &'a str,
        input: UpdateIssueInput<'a>,
    }
    let _: serde_json::Value = gql_dynamic(
        client,
        api_key,
        "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }".to_string(),
        Vars { id: issue_id, input },
    )
    .await?;
    Ok(())
}

pub async fn delete_issue(
    client: &Client,
    api_key: &str,
    issue_id: &str,
) -> Result<(), LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> {
        id: &'a str,
    }
    let _: serde_json::Value = gql(
        client,
        api_key,
        "mutation($id: String!) { issueDelete(id: $id) { success } }",
        Vars { id: issue_id },
    )
    .await?;
    Ok(())
}

pub async fn get_issue_by_id(
    client: &Client,
    api_key: &str,
    issue_id: &str,
) -> Result<LinearIssue, LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> {
        id: &'a str,
    }
    #[derive(Deserialize)]
    struct Data {
        issue: LinearIssue,
    }
    let issue_fields = "id identifier title description priority dueDate state { id name type position } assignee { id email name } labels { nodes { id name } }";
    let data: Data = gql_dynamic(
        client,
        api_key,
        format!("query($id: String!) {{ issue(id: $id) {{ {issue_fields} }} }}"),
        Vars { id: issue_id },
    )
    .await?;
    Ok(data.issue)
}

// ── Comments ──────────────────────────────────────────────────────────────────

pub async fn create_comment(
    client: &Client,
    api_key: &str,
    issue_id: &str,
    body: &str,
) -> Result<String, LinearClientError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Vars<'a> {
        issue_id: &'a str,
        body: &'a str,
    }
    #[derive(Deserialize)]
    struct Comment {
        id: String,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CommentCreate {
        comment: Comment,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Data {
        comment_create: CommentCreate,
    }
    let data: Data = gql(
        client,
        api_key,
        "mutation($issue_id: String!, $body: String!) { commentCreate(input: { issueId: $issue_id, body: $body }) { comment { id } } }",
        Vars { issue_id, body },
    )
    .await?;
    Ok(data.comment_create.comment.id)
}

pub async fn update_comment(
    client: &Client,
    api_key: &str,
    comment_id: &str,
    body: &str,
) -> Result<(), LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> {
        id: &'a str,
        body: &'a str,
    }
    let _: serde_json::Value = gql(
        client,
        api_key,
        "mutation($id: String!, $body: String!) { commentUpdate(id: $id, input: { body: $body }) { success } }",
        Vars { id: comment_id, body },
    )
    .await?;
    Ok(())
}

pub async fn delete_comment(
    client: &Client,
    api_key: &str,
    comment_id: &str,
) -> Result<(), LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> {
        id: &'a str,
    }
    let _: serde_json::Value = gql(
        client,
        api_key,
        "mutation($id: String!) { commentDelete(id: $id) { success } }",
        Vars { id: comment_id },
    )
    .await?;
    Ok(())
}

// ── Labels ────────────────────────────────────────────────────────────────────

pub async fn create_label(
    client: &Client,
    api_key: &str,
    team_id: &str,
    name: &str,
    color: &str,
) -> Result<String, LinearClientError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Vars<'a> {
        team_id: &'a str,
        name: &'a str,
        color: &'a str,
    }
    #[derive(Deserialize)]
    struct Label {
        id: String,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct LabelCreate {
        label: Label,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Data {
        issue_label_create: LabelCreate,
    }
    let data: Data = gql(
        client,
        api_key,
        "mutation($team_id: String!, $name: String!, $color: String!) { issueLabelCreate(input: { teamId: $team_id, name: $name, color: $color }) { label { id } } }",
        Vars { team_id, name, color },
    )
    .await?;
    Ok(data.issue_label_create.label.id)
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

pub async fn register_webhook(
    client: &Client,
    api_key: &str,
    team_id: &str,
    url: &str,
    secret: &str,
) -> Result<String, LinearClientError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Vars<'a> {
        team_id: &'a str,
        url: &'a str,
        secret: &'a str,
    }
    #[derive(Deserialize)]
    struct Webhook {
        id: String,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WebhookCreate {
        webhook: Webhook,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Data {
        webhook_create: WebhookCreate,
    }
    let data: Data = gql(
        client,
        api_key,
        r#"mutation($team_id: String!, $url: String!, $secret: String!) {
            webhookCreate(input: {
                teamId: $team_id, url: $url, secret: $secret,
                resourceTypes: ["Issue", "Comment"]
            }) { webhook { id } }
        }"#,
        Vars { team_id, url, secret },
    )
    .await?;
    Ok(data.webhook_create.webhook.id)
}

pub async fn delete_webhook(
    client: &Client,
    api_key: &str,
    webhook_id: &str,
) -> Result<(), LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> {
        id: &'a str,
    }
    let _: serde_json::Value = gql(
        client,
        api_key,
        "mutation($id: String!) { webhookDelete(id: $id) { success } }",
        Vars { id: webhook_id },
    )
    .await?;
    Ok(())
}
