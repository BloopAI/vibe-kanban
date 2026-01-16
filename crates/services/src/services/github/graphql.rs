//! GitHub GraphQL API client using the `gh` CLI.
//!
//! This module provides a low-level GraphQL client that leverages the existing
//! `gh` CLI authentication to make GraphQL API calls.

use std::process::Command;

use serde::{de::DeserializeOwned, Deserialize};
use thiserror::Error;
use utils::shell::resolve_executable_path_blocking;

#[derive(Debug, Error)]
pub enum GitHubGraphQLError {
    #[error("GitHub CLI (`gh`) executable not found")]
    CliNotAvailable,
    #[error("GitHub CLI authentication failed: {0}")]
    AuthFailed(String),
    #[error("GraphQL query failed: {0}")]
    QueryFailed(String),
    #[error("Failed to parse GraphQL response: {0}")]
    ParseError(String),
    #[error("GraphQL API returned errors: {0:?}")]
    ApiErrors(Vec<GraphQLError>),
}

#[derive(Debug, Clone, Deserialize)]
pub struct GraphQLError {
    pub message: String,
    #[serde(default)]
    pub r#type: Option<String>,
    #[serde(default)]
    pub path: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
struct GraphQLResponse<T> {
    pub data: Option<T>,
    pub errors: Option<Vec<GraphQLError>>,
}

#[derive(Debug, Clone, Default)]
pub struct GitHubGraphQL;

impl GitHubGraphQL {
    pub fn new() -> Self {
        Self
    }

    /// Check if the GitHub CLI is available and authenticated.
    pub fn check_available(&self) -> Result<(), GitHubGraphQLError> {
        let gh = resolve_executable_path_blocking("gh").ok_or(GitHubGraphQLError::CliNotAvailable)?;

        let output = Command::new(&gh)
            .args(["auth", "status"])
            .output()
            .map_err(|e| GitHubGraphQLError::QueryFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(GitHubGraphQLError::AuthFailed(stderr));
        }

        Ok(())
    }

    /// Execute a GraphQL query against the GitHub API.
    pub fn query<T: DeserializeOwned>(
        &self,
        query: &str,
        variables: Option<serde_json::Value>,
    ) -> Result<T, GitHubGraphQLError> {
        let gh = resolve_executable_path_blocking("gh").ok_or(GitHubGraphQLError::CliNotAvailable)?;

        let mut cmd = Command::new(&gh);
        cmd.args(["api", "graphql"]);

        cmd.args(["-f", &format!("query={}", query)]);

        // Add variables if present
        if let Some(vars) = variables {
            if let serde_json::Value::Object(map) = vars {
                for (key, value) in map {
                    let value_str = match &value {
                        serde_json::Value::String(s) => s.clone(),
                        _ => value.to_string(),
                    };
                    cmd.args(["-F", &format!("{}={}", key, value_str)]);
                }
            }
        }

        let output = cmd
            .output()
            .map_err(|e| GitHubGraphQLError::QueryFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            // Check for authentication errors
            let lower = stderr.to_ascii_lowercase();
            if lower.contains("authentication failed")
                || lower.contains("must authenticate")
                || lower.contains("bad credentials")
                || lower.contains("unauthorized")
                || output.status.code() == Some(4)
            {
                return Err(GitHubGraphQLError::AuthFailed(stderr));
            }

            return Err(GitHubGraphQLError::QueryFailed(stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let response: GraphQLResponse<T> = serde_json::from_str(&stdout)
            .map_err(|e| GitHubGraphQLError::ParseError(format!("{}: {}", e, stdout)))?;

        // Check for GraphQL errors
        if let Some(errors) = response.errors {
            if !errors.is_empty() {
                return Err(GitHubGraphQLError::ApiErrors(errors));
            }
        }

        response
            .data
            .ok_or_else(|| GitHubGraphQLError::ParseError("No data in response".to_string()))
    }

    /// Execute a GraphQL mutation against the GitHub API.
    pub fn mutate<T: DeserializeOwned>(
        &self,
        mutation: &str,
        variables: Option<serde_json::Value>,
    ) -> Result<T, GitHubGraphQLError> {
        // Mutations use the same mechanism as queries
        self.query(mutation, variables)
    }
}

// GraphQL fragments and queries for GitHub Projects v2
pub mod queries {
    pub const PROJECT_FRAGMENT: &str = r#"
        fragment ProjectFields on ProjectV2 {
            id
            title
            number
            url
            closed
            shortDescription
            public
            owner {
                ... on Organization {
                    login
                }
                ... on User {
                    login
                }
            }
        }
    "#;

    pub const ISSUE_FRAGMENT: &str = r#"
        fragment IssueFields on Issue {
            id
            number
            title
            body
            state
            url
            createdAt
            updatedAt
            closedAt
            author {
                login
            }
            assignees(first: 10) {
                nodes {
                    login
                }
            }
            labels(first: 20) {
                nodes {
                    name
                    color
                }
            }
            milestone {
                id
                title
                number
            }
        }
    "#;

    /// Query to list projects for a user
    pub const LIST_USER_PROJECTS: &str = r#"
        query ListUserProjects($login: String!, $first: Int!, $after: String) {
            user(login: $login) {
                projectsV2(first: $first, after: $after) {
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                    nodes {
                        ...ProjectFields
                    }
                }
            }
        }
    "#;

    /// Query to list projects for an organization
    pub const LIST_ORG_PROJECTS: &str = r#"
        query ListOrgProjects($login: String!, $first: Int!, $after: String) {
            organization(login: $login) {
                projectsV2(first: $first, after: $after) {
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                    nodes {
                        ...ProjectFields
                    }
                }
            }
        }
    "#;

    /// Query to list projects for a repository
    pub const LIST_REPO_PROJECTS: &str = r#"
        query ListRepoProjects($owner: String!, $repo: String!, $first: Int!, $after: String) {
            repository(owner: $owner, name: $repo) {
                projectsV2(first: $first, after: $after) {
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                    nodes {
                        ...ProjectFields
                    }
                }
            }
        }
    "#;

    /// Query to get project by ID with items (issues)
    pub const GET_PROJECT_ITEMS: &str = r#"
        query GetProjectItems($projectId: ID!, $first: Int!, $after: String) {
            node(id: $projectId) {
                ... on ProjectV2 {
                    items(first: $first, after: $after) {
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                        nodes {
                            id
                            content {
                                ... on Issue {
                                    ...IssueFields
                                }
                            }
                            fieldValues(first: 20) {
                                nodes {
                                    ... on ProjectV2ItemFieldSingleSelectValue {
                                        name
                                        field {
                                            ... on ProjectV2SingleSelectField {
                                                name
                                            }
                                        }
                                    }
                                    ... on ProjectV2ItemFieldTextValue {
                                        text
                                        field {
                                            ... on ProjectV2Field {
                                                name
                                            }
                                        }
                                    }
                                    ... on ProjectV2ItemFieldDateValue {
                                        date
                                        field {
                                            ... on ProjectV2Field {
                                                name
                                            }
                                        }
                                    }
                                    ... on ProjectV2ItemFieldNumberValue {
                                        number
                                        field {
                                            ... on ProjectV2Field {
                                                name
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    "#;

    /// Query to get project fields (for status field mapping)
    pub const GET_PROJECT_FIELDS: &str = r#"
        query GetProjectFields($projectId: ID!) {
            node(id: $projectId) {
                ... on ProjectV2 {
                    fields(first: 50) {
                        nodes {
                            ... on ProjectV2Field {
                                id
                                name
                                dataType
                            }
                            ... on ProjectV2SingleSelectField {
                                id
                                name
                                options {
                                    id
                                    name
                                }
                            }
                            ... on ProjectV2IterationField {
                                id
                                name
                            }
                        }
                    }
                }
            }
        }
    "#;

    /// Mutation to update project item field value
    pub const UPDATE_PROJECT_ITEM_FIELD: &str = r#"
        mutation UpdateProjectItemField($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
            updateProjectV2ItemFieldValue(input: {
                projectId: $projectId
                itemId: $itemId
                fieldId: $fieldId
                value: $value
            }) {
                projectV2Item {
                    id
                }
            }
        }
    "#;

    /// Query to get issue by number
    pub const GET_ISSUE: &str = r#"
        query GetIssue($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
                issue(number: $number) {
                    ...IssueFields
                }
            }
        }
    "#;

    /// Mutation to update issue
    pub const UPDATE_ISSUE: &str = r#"
        mutation UpdateIssue($id: ID!, $title: String, $body: String, $state: IssueState) {
            updateIssue(input: {
                id: $id
                title: $title
                body: $body
                state: $state
            }) {
                issue {
                    ...IssueFields
                }
            }
        }
    "#;

    /// Mutation to create issue
    pub const CREATE_ISSUE: &str = r#"
        mutation CreateIssue($repositoryId: ID!, $title: String!, $body: String) {
            createIssue(input: {
                repositoryId: $repositoryId
                title: $title
                body: $body
            }) {
                issue {
                    ...IssueFields
                }
            }
        }
    "#;

    /// Query to get repository ID
    pub const GET_REPOSITORY_ID: &str = r#"
        query GetRepositoryId($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) {
                id
            }
        }
    "#;

    /// Query to get viewer (authenticated user) info
    pub const GET_VIEWER: &str = r#"
        query GetViewer {
            viewer {
                login
                id
            }
        }
    "#;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_graphql_error_display() {
        let error = GitHubGraphQLError::QueryFailed("test error".to_string());
        assert!(error.to_string().contains("test error"));
    }
}
