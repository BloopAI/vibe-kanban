// This file was auto-generated. Do not edit manually.
import type {
  ElectricProject,
  ElectricNotification,
  ElectricWorkspace,
  ElectricProjectStatus,
  ElectricTag,
  ElectricIssue,
  ElectricIssueAssignee,
  ElectricIssueFollower,
  ElectricIssueTag,
  ElectricIssueDependency,
  ElectricIssueComment,
  ElectricIssueCommentReaction,
} from './types';

// Shape definition interface
export interface ShapeDefinition<T> {
  readonly table: string;
  readonly params: readonly string[];
  readonly url: string;
  readonly _type: T;  // Phantom field for type inference
}

// Helper to create type-safe shape definitions
function defineShape<T>(
  table: string,
  params: readonly string[],
  url: string
): ShapeDefinition<T> {
  return { table, params, url, _type: null as unknown as T };
}

// Individual shape definitions with embedded types
export const PROJECTS_SHAPE = defineShape<ElectricProject>(
  'projects',
  ['organization_id'] as const,
  '/shape/projects'
);

export const NOTIFICATIONS_SHAPE = defineShape<ElectricNotification>(
  'notifications',
  ['organization_id', 'user_id'] as const,
  '/shape/notifications'
);

export const WORKSPACES_SHAPE = defineShape<ElectricWorkspace>(
  'workspaces',
  ['project_id'] as const,
  '/shape/project/{project_id}/workspaces'
);

export const PROJECT_STATUSES_SHAPE = defineShape<ElectricProjectStatus>(
  'project_statuses',
  ['project_id'] as const,
  '/shape/project/{project_id}/statuses'
);

export const TAGS_SHAPE = defineShape<ElectricTag>(
  'tags',
  ['project_id'] as const,
  '/shape/project/{project_id}/tags'
);

export const ISSUES_SHAPE = defineShape<ElectricIssue>(
  'issues',
  ['project_id'] as const,
  '/shape/project/{project_id}/issues'
);

export const ISSUE_ASSIGNEES_SHAPE = defineShape<ElectricIssueAssignee>(
  'issue_assignees',
  ['project_id'] as const,
  '/shape/project/{project_id}/issue_assignees'
);

export const ISSUE_FOLLOWERS_SHAPE = defineShape<ElectricIssueFollower>(
  'issue_followers',
  ['project_id'] as const,
  '/shape/project/{project_id}/issue_followers'
);

export const ISSUE_TAGS_SHAPE = defineShape<ElectricIssueTag>(
  'issue_tags',
  ['project_id'] as const,
  '/shape/project/{project_id}/issue_tags'
);

export const ISSUE_DEPENDENCIES_SHAPE = defineShape<ElectricIssueDependency>(
  'issue_dependencies',
  ['project_id'] as const,
  '/shape/project/{project_id}/issue_dependencies'
);

export const ISSUE_COMMENTS_SHAPE = defineShape<ElectricIssueComment>(
  'issue_comments',
  ['issue_id'] as const,
  '/shape/issue/{issue_id}/comments'
);

export const ISSUE_COMMENT_REACTIONS_SHAPE = defineShape<ElectricIssueCommentReaction>(
  'issue_comment_reactions',
  ['issue_id'] as const,
  '/shape/issue/{issue_id}/reactions'
);

// All shapes as an array for iteration and factory building
export const ALL_SHAPES = [
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
] as const;

// Type helper to extract row type from a shape
export type ShapeRowType<S extends ShapeDefinition<unknown>> = S['_type'];

// Union of all shape types
export type AnyShape = typeof ALL_SHAPES[number];
