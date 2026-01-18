/**
 * Electric SDK - Type-safe collection factory functions for each shape.
 *
 * Each function creates an Electric collection for syncing data with the backend.
 * Keys are auto-detected at runtime based on the entity structure.
 */

import { createElectricCollection } from './collections';
import type { CollectionConfig } from './types';
import {
  PROJECTS_SHAPE,
  NOTIFICATIONS_SHAPE,
  WORKSPACES_SHAPE,
  PROJECT_STATUSES_SHAPE,
  TAGS_SHAPE,
  ISSUES_SHAPE,
  ISSUE_ASSIGNEES_SHAPE,
  ISSUE_FOLLOWERS_SHAPE,
  ISSUE_TAGS_SHAPE,
  ISSUE_DEPENDENCIES_SHAPE,
  ISSUE_COMMENTS_SHAPE,
  ISSUE_COMMENT_REACTIONS_SHAPE,
} from 'shared/shapes';

// ============================================================================
// Organization-scoped collections
// ============================================================================

/**
 * Create a collection for syncing projects in an organization.
 */
export function createProjectsCollection(
  organizationId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(
    PROJECTS_SHAPE,
    { organization_id: organizationId },
    config
  );
}

/**
 * Create a collection for syncing notifications for a user in an organization.
 */
export function createNotificationsCollection(
  organizationId: string,
  userId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(
    NOTIFICATIONS_SHAPE,
    { organization_id: organizationId, user_id: userId },
    config
  );
}

// ============================================================================
// Project-scoped collections
// ============================================================================

/**
 * Create a collection for syncing workspaces in a project.
 */
export function createWorkspacesCollection(
  projectId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(
    WORKSPACES_SHAPE,
    { project_id: projectId },
    config
  );
}

/**
 * Create a collection for syncing project statuses.
 */
export function createProjectStatusesCollection(
  projectId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(
    PROJECT_STATUSES_SHAPE,
    { project_id: projectId },
    config
  );
}

/**
 * Create a collection for syncing tags in a project.
 */
export function createTagsCollection(
  projectId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(TAGS_SHAPE, { project_id: projectId }, config);
}

/**
 * Create a collection for syncing issues in a project.
 */
export function createIssuesCollection(
  projectId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(ISSUES_SHAPE, { project_id: projectId }, config);
}

/**
 * Create a collection for syncing issue assignees in a project.
 */
export function createIssueAssigneesCollection(
  projectId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(
    ISSUE_ASSIGNEES_SHAPE,
    { project_id: projectId },
    config
  );
}

/**
 * Create a collection for syncing issue followers in a project.
 */
export function createIssueFollowersCollection(
  projectId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(
    ISSUE_FOLLOWERS_SHAPE,
    { project_id: projectId },
    config
  );
}

/**
 * Create a collection for syncing issue tags in a project.
 */
export function createIssueTagsCollection(
  projectId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(
    ISSUE_TAGS_SHAPE,
    { project_id: projectId },
    config
  );
}

/**
 * Create a collection for syncing issue dependencies in a project.
 */
export function createIssueDependenciesCollection(
  projectId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(
    ISSUE_DEPENDENCIES_SHAPE,
    { project_id: projectId },
    config
  );
}

// ============================================================================
// Issue-scoped collections
// ============================================================================

/**
 * Create a collection for syncing comments on an issue.
 */
export function createIssueCommentsCollection(
  issueId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(
    ISSUE_COMMENTS_SHAPE,
    { issue_id: issueId },
    config
  );
}

/**
 * Create a collection for syncing reactions on issue comments.
 */
export function createIssueCommentReactionsCollection(
  issueId: string,
  config?: CollectionConfig
) {
  return createElectricCollection(
    ISSUE_COMMENT_REACTIONS_SHAPE,
    { issue_id: issueId },
    config
  );
}
