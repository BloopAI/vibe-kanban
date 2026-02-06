//! Marker trait implementations linking request types to row types.
//!
//! These traits are used by `MutationDef` to enforce compile-time type safety
//! between request types and their corresponding row types.

use api_types::{
    CreateIssueAssigneeRequest, CreateIssueCommentReactionRequest, CreateIssueCommentRequest,
    CreateIssueFollowerRequest, CreateIssueRelationshipRequest, CreateIssueRequest,
    CreateIssueTagRequest, CreateProjectRequest, CreateProjectStatusRequest, CreateTagRequest,
    Issue, IssueAssignee, IssueComment, IssueCommentReaction, IssueFollower, IssueRelationship,
    IssueTag, Notification, Project, ProjectStatus, Tag, UpdateIssueAssigneeRequest,
    UpdateIssueCommentReactionRequest, UpdateIssueCommentRequest, UpdateIssueFollowerRequest,
    UpdateIssueRelationshipRequest, UpdateIssueRequest, UpdateIssueTagRequest,
    UpdateNotificationRequest, UpdateProjectRequest, UpdateProjectStatusRequest, UpdateTagRequest,
};

use crate::mutation_def::{CreateRequestFor, UpdateRequestFor};

// =============================================================================
// Project
// =============================================================================

impl CreateRequestFor for CreateProjectRequest {
    type Row = Project;
}

impl UpdateRequestFor for UpdateProjectRequest {
    type Row = Project;
}

// =============================================================================
// Notification (update only - no public create endpoint)
// =============================================================================

impl UpdateRequestFor for UpdateNotificationRequest {
    type Row = Notification;
}

// =============================================================================
// Tag
// =============================================================================

impl CreateRequestFor for CreateTagRequest {
    type Row = Tag;
}

impl UpdateRequestFor for UpdateTagRequest {
    type Row = Tag;
}

// =============================================================================
// ProjectStatus
// =============================================================================

impl CreateRequestFor for CreateProjectStatusRequest {
    type Row = ProjectStatus;
}

impl UpdateRequestFor for UpdateProjectStatusRequest {
    type Row = ProjectStatus;
}

// =============================================================================
// Issue
// =============================================================================

impl CreateRequestFor for CreateIssueRequest {
    type Row = Issue;
}

impl UpdateRequestFor for UpdateIssueRequest {
    type Row = Issue;
}

// =============================================================================
// IssueAssignee
// =============================================================================

impl CreateRequestFor for CreateIssueAssigneeRequest {
    type Row = IssueAssignee;
}

impl UpdateRequestFor for UpdateIssueAssigneeRequest {
    type Row = IssueAssignee;
}

// =============================================================================
// IssueFollower
// =============================================================================

impl CreateRequestFor for CreateIssueFollowerRequest {
    type Row = IssueFollower;
}

impl UpdateRequestFor for UpdateIssueFollowerRequest {
    type Row = IssueFollower;
}

// =============================================================================
// IssueTag
// =============================================================================

impl CreateRequestFor for CreateIssueTagRequest {
    type Row = IssueTag;
}

impl UpdateRequestFor for UpdateIssueTagRequest {
    type Row = IssueTag;
}

// =============================================================================
// IssueRelationship
// =============================================================================

impl CreateRequestFor for CreateIssueRelationshipRequest {
    type Row = IssueRelationship;
}

impl UpdateRequestFor for UpdateIssueRelationshipRequest {
    type Row = IssueRelationship;
}

// =============================================================================
// IssueComment
// =============================================================================

impl CreateRequestFor for CreateIssueCommentRequest {
    type Row = IssueComment;
}

impl UpdateRequestFor for UpdateIssueCommentRequest {
    type Row = IssueComment;
}

// =============================================================================
// IssueCommentReaction
// =============================================================================

impl CreateRequestFor for CreateIssueCommentReactionRequest {
    type Row = IssueCommentReaction;
}

impl UpdateRequestFor for UpdateIssueCommentReactionRequest {
    type Row = IssueCommentReaction;
}
