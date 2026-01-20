//! Centralized mutation type definitions.
//!
//! **DEPRECATED**: This module is deprecated. Use `entities` module instead.
//!
//! The `entities` module provides a unified `define_entity!` macro that generates
//! both mutation types and shape definitions from a single declaration.
//!
//! This module now re-exports types from `entities` for backward compatibility.
//! Route files can continue to import from here, but new code should use `entities`.

// Re-export all mutation types from the unified entities module
pub use crate::entities::{
    // IssueAssignee mutations
    CreateIssueAssigneeRequest,
    // IssueCommentReaction mutations
    CreateIssueCommentReactionRequest,
    // IssueComment mutations
    CreateIssueCommentRequest,
    // IssueFollower mutations
    CreateIssueFollowerRequest,
    // IssueRelationship mutations
    CreateIssueRelationshipRequest,
    // Issue mutations
    CreateIssueRequest,
    // IssueTag mutations
    CreateIssueTagRequest,
    // Notification mutations
    CreateNotificationRequest,
    // Project mutations
    CreateProjectRequest,
    // ProjectStatus mutations
    CreateProjectStatusRequest,
    // Tag mutations
    CreateTagRequest,
    ISSUE_ASSIGNEE_URL,
    ISSUE_COMMENT_REACTION_URL,
    ISSUE_COMMENT_URL,
    ISSUE_FOLLOWER_URL,
    ISSUE_RELATIONSHIP_URL,
    ISSUE_TAG_URL,
    ISSUE_URL,
    ListIssueAssigneesQuery,
    ListIssueAssigneesResponse,
    ListIssueCommentReactionsQuery,
    ListIssueCommentReactionsResponse,
    ListIssueCommentsQuery,
    ListIssueCommentsResponse,
    ListIssueFollowersQuery,
    ListIssueFollowersResponse,
    ListIssueRelationshipsQuery,
    ListIssueRelationshipsResponse,
    ListIssueTagsQuery,
    ListIssueTagsResponse,
    ListIssuesQuery,
    ListIssuesResponse,
    ListNotificationsQuery,
    ListNotificationsResponse,
    ListProjectStatussQuery,
    ListProjectStatussResponse,
    ListProjectsQuery,
    ListProjectsResponse,
    ListTagsQuery,
    ListTagsResponse,
    NOTIFICATION_URL,
    PROJECT_STATUS_URL,
    PROJECT_URL,
    TAG_URL,
    UpdateIssueAssigneeRequest,
    UpdateIssueCommentReactionRequest,
    UpdateIssueCommentRequest,
    UpdateIssueFollowerRequest,
    UpdateIssueRelationshipRequest,
    UpdateIssueRequest,
    UpdateIssueTagRequest,
    UpdateNotificationRequest,
    UpdateProjectRequest,
    UpdateProjectStatusRequest,
    UpdateTagRequest,
};
