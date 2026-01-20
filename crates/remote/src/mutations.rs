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
    // Project mutations
    CreateProjectRequest, UpdateProjectRequest, ListProjectsQuery, ListProjectsResponse, PROJECT_URL,
    // Notification mutations
    CreateNotificationRequest, UpdateNotificationRequest, ListNotificationsQuery, ListNotificationsResponse, NOTIFICATION_URL,
    // Tag mutations
    CreateTagRequest, UpdateTagRequest, ListTagsQuery, ListTagsResponse, TAG_URL,
    // ProjectStatus mutations
    CreateProjectStatusRequest, UpdateProjectStatusRequest, ListProjectStatussQuery, ListProjectStatussResponse, PROJECT_STATUS_URL,
    // Issue mutations
    CreateIssueRequest, UpdateIssueRequest, ListIssuesQuery, ListIssuesResponse, ISSUE_URL,
    // IssueComment mutations
    CreateIssueCommentRequest, UpdateIssueCommentRequest, ListIssueCommentsQuery, ListIssueCommentsResponse, ISSUE_COMMENT_URL,
    // IssueAssignee mutations
    CreateIssueAssigneeRequest, UpdateIssueAssigneeRequest, ListIssueAssigneesQuery, ListIssueAssigneesResponse, ISSUE_ASSIGNEE_URL,
    // IssueFollower mutations
    CreateIssueFollowerRequest, UpdateIssueFollowerRequest, ListIssueFollowersQuery, ListIssueFollowersResponse, ISSUE_FOLLOWER_URL,
    // IssueTag mutations
    CreateIssueTagRequest, UpdateIssueTagRequest, ListIssueTagsQuery, ListIssueTagsResponse, ISSUE_TAG_URL,
    // IssueRelationship mutations
    CreateIssueRelationshipRequest, UpdateIssueRelationshipRequest, ListIssueRelationshipsQuery, ListIssueRelationshipsResponse, ISSUE_RELATIONSHIP_URL,
    // IssueCommentReaction mutations
    CreateIssueCommentReactionRequest, UpdateIssueCommentReactionRequest, ListIssueCommentReactionsQuery, ListIssueCommentReactionsResponse, ISSUE_COMMENT_REACTION_URL,
};
