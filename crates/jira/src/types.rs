use serde::{Deserialize, Serialize};

// --- Search ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub start_at: u32,
    pub max_results: u32,
    pub total: u32,
    pub issues: Vec<Issue>,
}

// --- Issue ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub id: String,
    pub key: String,
    #[serde(rename = "self")]
    pub self_url: String,
    pub fields: IssueFields,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueFields {
    pub summary: Option<String>,
    pub description: Option<serde_json::Value>,
    pub status: Option<Status>,
    pub priority: Option<Priority>,
    pub assignee: Option<User>,
    pub reporter: Option<User>,
    pub comment: Option<CommentPage>,
    pub labels: Option<Vec<String>>,
    pub created: Option<String>,
    pub updated: Option<String>,
}

// --- Status ---

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub id: String,
    pub name: String,
    pub status_category: Option<StatusCategory>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusCategory {
    pub id: u32,
    pub key: String,
    pub name: String,
    pub color_name: Option<String>,
}

// --- Priority ---

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Priority {
    pub id: String,
    pub name: String,
    pub icon_url: Option<String>,
}

// --- Comments ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentPage {
    pub comments: Vec<Comment>,
    pub start_at: Option<u32>,
    pub max_results: Option<u32>,
    pub total: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub author: Option<User>,
    pub body: Option<serde_json::Value>,
    pub created: Option<String>,
    pub updated: Option<String>,
}

// --- User ---

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub account_id: Option<String>,
    pub display_name: Option<String>,
    pub email_address: Option<String>,
}

// --- Transitions ---

#[derive(Debug, Deserialize)]
pub struct TransitionsResponse {
    pub transitions: Vec<Transition>,
}

#[derive(Debug, Deserialize)]
pub struct Transition {
    pub id: String,
    pub name: String,
    pub to: Option<Status>,
}

// --- Project statuses ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueTypeWithStatuses {
    pub id: String,
    pub name: String,
    pub statuses: Vec<Status>,
}
