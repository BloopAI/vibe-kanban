//! Marker trait implementations linking request types to entity types.
//!
//! These traits are used by `EntityDef` to enforce compile-time type safety
//! between request types and their corresponding entity types.

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
    type Entity = Project;
}

impl UpdateRequestFor for UpdateProjectRequest {
    type Entity = Project;
}

// =============================================================================
// Notification (update only - no public create endpoint)
// =============================================================================

impl UpdateRequestFor for UpdateNotificationRequest {
    type Entity = Notification;
}

// =============================================================================
// Tag
// =============================================================================

impl CreateRequestFor for CreateTagRequest {
    type Entity = Tag;
}

impl UpdateRequestFor for UpdateTagRequest {
    type Entity = Tag;
}

// =============================================================================
// ProjectStatus
// =============================================================================

impl CreateRequestFor for CreateProjectStatusRequest {
    type Entity = ProjectStatus;
}

impl UpdateRequestFor for UpdateProjectStatusRequest {
    type Entity = ProjectStatus;
}

// =============================================================================
// Issue
// =============================================================================

impl CreateRequestFor for CreateIssueRequest {
    type Entity = Issue;
}

impl UpdateRequestFor for UpdateIssueRequest {
    type Entity = Issue;
}

// =============================================================================
// IssueAssignee
// =============================================================================

impl CreateRequestFor for CreateIssueAssigneeRequest {
    type Entity = IssueAssignee;
}

impl UpdateRequestFor for UpdateIssueAssigneeRequest {
    type Entity = IssueAssignee;
}

// =============================================================================
// IssueFollower
// =============================================================================

impl CreateRequestFor for CreateIssueFollowerRequest {
    type Entity = IssueFollower;
}

impl UpdateRequestFor for UpdateIssueFollowerRequest {
    type Entity = IssueFollower;
}

// =============================================================================
// IssueTag
// =============================================================================

impl CreateRequestFor for CreateIssueTagRequest {
    type Entity = IssueTag;
}

impl UpdateRequestFor for UpdateIssueTagRequest {
    type Entity = IssueTag;
}

// =============================================================================
// IssueRelationship
// =============================================================================

impl CreateRequestFor for CreateIssueRelationshipRequest {
    type Entity = IssueRelationship;
}

impl UpdateRequestFor for UpdateIssueRelationshipRequest {
    type Entity = IssueRelationship;
}

// =============================================================================
// IssueComment
// =============================================================================

impl CreateRequestFor for CreateIssueCommentRequest {
    type Entity = IssueComment;
}

impl UpdateRequestFor for UpdateIssueCommentRequest {
    type Entity = IssueComment;
}

// =============================================================================
// IssueCommentReaction
// =============================================================================

impl CreateRequestFor for CreateIssueCommentReactionRequest {
    type Entity = IssueCommentReaction;
}

impl UpdateRequestFor for UpdateIssueCommentReactionRequest {
    type Entity = IssueCommentReaction;
}
