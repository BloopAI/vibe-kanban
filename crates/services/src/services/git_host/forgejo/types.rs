//! Forgejo/Gitea API types.
//!
//! These types correspond to the Forgejo/Gitea REST API responses.
//! See: https://codeberg.org/api/swagger

#![allow(dead_code)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// User information from Forgejo API.
#[derive(Debug, Clone, Deserialize)]
pub struct User {
    pub id: i64,
    pub login: String,
    pub full_name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

/// Repository information from Forgejo API.
#[derive(Debug, Clone, Deserialize)]
pub struct Repository {
    pub id: i64,
    pub owner: User,
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub clone_url: String,
    pub ssh_url: String,
}

/// Pull request state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PullRequestState {
    Open,
    Closed,
}

/// Pull request information from Forgejo API.
#[derive(Debug, Clone, Deserialize)]
pub struct PullRequest {
    pub id: i64,
    pub number: i64,
    pub state: PullRequestState,
    pub title: String,
    pub body: Option<String>,
    pub html_url: String,
    pub user: User,
    pub merged: bool,
    pub merged_at: Option<DateTime<Utc>>,
    pub merge_commit_sha: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub head: PullRequestBranch,
    pub base: PullRequestBranch,
}

/// Branch reference in a pull request.
#[derive(Debug, Clone, Deserialize)]
pub struct PullRequestBranch {
    #[serde(rename = "ref")]
    pub branch_ref: String,
    pub sha: String,
    pub repo: Option<Repository>,
}

/// Request body for creating a pull request.
#[derive(Debug, Clone, Serialize)]
pub struct CreatePullRequestOption {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    pub head: String,
    pub base: String,
}

/// Issue/PR comment from Forgejo API.
#[derive(Debug, Clone, Deserialize)]
pub struct Comment {
    pub id: i64,
    pub html_url: String,
    pub body: String,
    pub user: User,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// API version response.
#[derive(Debug, Clone, Deserialize)]
pub struct Version {
    pub version: String,
}

/// Error response from Forgejo API.
#[derive(Debug, Clone, Deserialize)]
pub struct ApiError {
    pub message: String,
    pub url: Option<String>,
}
