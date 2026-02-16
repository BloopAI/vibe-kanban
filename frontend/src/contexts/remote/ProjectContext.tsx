import { useContext, useMemo, useCallback, type ReactNode } from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';
import {
  useShape,
  type InsertResult,
  type MutationResult,
} from '@/lib/electric/hooks';
import {
  PROJECT_ISSUES_SHAPE,
  PROJECT_PROJECT_STATUSES_SHAPE,
  PROJECT_TAGS_SHAPE,
  PROJECT_ISSUE_ASSIGNEES_SHAPE,
  PROJECT_ISSUE_FOLLOWERS_SHAPE,
  PROJECT_ISSUE_TAGS_SHAPE,
  PROJECT_ISSUE_RELATIONSHIPS_SHAPE,
  PROJECT_PULL_REQUESTS_SHAPE,
  PROJECT_WORKSPACES_SHAPE,
  PROJECT_BLOBS_SHAPE,
  PROJECT_ATTACHMENTS_SHAPE,
  ISSUE_MUTATION,
  PROJECT_STATUS_MUTATION,
  TAG_MUTATION,
  ISSUE_ASSIGNEE_MUTATION,
  ISSUE_FOLLOWER_MUTATION,
  ISSUE_TAG_MUTATION,
  ISSUE_RELATIONSHIP_MUTATION,
  type Issue,
  type ProjectStatus,
  type Tag,
  type IssueAssignee,
  type IssueFollower,
  type IssueTag,
  type IssueRelationship,
  type PullRequest,
  type Workspace,
  type Blob as RemoteBlob,
  type Attachment,
  type CreateIssueRequest,
  type UpdateIssueRequest,
  type CreateProjectStatusRequest,
  type UpdateProjectStatusRequest,
  type CreateTagRequest,
  type UpdateTagRequest,
  type CreateIssueAssigneeRequest,
  type CreateIssueFollowerRequest,
  type CreateIssueTagRequest,
  type CreateIssueRelationshipRequest,
} from 'shared/remote-types';
import type { SyncError } from '@/lib/electric/types';

/**
 * ProjectContext provides project-scoped data and mutations.
 *
 * Entities synced at project scope:
 * - Issues (data + mutations)
 * - ProjectStatuses (data + mutations)
 * - Tags (data + mutations)
 * - IssueAssignees (data + mutations)
 * - IssueFollowers (data + mutations)
 * - IssueTags (data + mutations)
 * - IssueRelationships (data + mutations)
 * - PullRequests (data only)
 * - Workspaces (data only)
 * - Blobs (data only)
 * - Attachments (data only)
 */
export interface ProjectContextValue {
  projectId: string;

  // Normalized data arrays
  issues: Issue[];
  statuses: ProjectStatus[];
  tags: Tag[];
  issueAssignees: IssueAssignee[];
  issueFollowers: IssueFollower[];
  issueTags: IssueTag[];
  issueRelationships: IssueRelationship[];
  pullRequests: PullRequest[];
  workspaces: Workspace[];
  blobs: RemoteBlob[];
  attachments: Attachment[];

  // Loading/error state
  isLoading: boolean;
  error: SyncError | null;
  retry: () => void;

  // Issue mutations
  insertIssue: (data: CreateIssueRequest) => InsertResult<Issue>;
  updateIssue: (
    id: string,
    changes: Partial<UpdateIssueRequest>
  ) => MutationResult;
  removeIssue: (id: string) => MutationResult;

  // Status mutations
  insertStatus: (
    data: CreateProjectStatusRequest
  ) => InsertResult<ProjectStatus>;
  updateStatus: (
    id: string,
    changes: Partial<UpdateProjectStatusRequest>
  ) => MutationResult;
  removeStatus: (id: string) => MutationResult;

  // Tag mutations
  insertTag: (data: CreateTagRequest) => InsertResult<Tag>;
  updateTag: (id: string, changes: Partial<UpdateTagRequest>) => MutationResult;
  removeTag: (id: string) => MutationResult;

  // IssueAssignee mutations
  insertIssueAssignee: (
    data: CreateIssueAssigneeRequest
  ) => InsertResult<IssueAssignee>;
  removeIssueAssignee: (id: string) => MutationResult;

  // IssueFollower mutations
  insertIssueFollower: (
    data: CreateIssueFollowerRequest
  ) => InsertResult<IssueFollower>;
  removeIssueFollower: (id: string) => MutationResult;

  // IssueTag mutations
  insertIssueTag: (data: CreateIssueTagRequest) => InsertResult<IssueTag>;
  removeIssueTag: (id: string) => MutationResult;

  // IssueRelationship mutations
  insertIssueRelationship: (
    data: CreateIssueRelationshipRequest
  ) => InsertResult<IssueRelationship>;
  removeIssueRelationship: (id: string) => MutationResult;

  // Lookup helpers
  getIssue: (issueId: string) => Issue | undefined;
  getIssuesForStatus: (statusId: string) => Issue[];
  getAssigneesForIssue: (issueId: string) => IssueAssignee[];
  getFollowersForIssue: (issueId: string) => IssueFollower[];
  getTagsForIssue: (issueId: string) => IssueTag[];
  getTagObjectsForIssue: (issueId: string) => Tag[];
  getRelationshipsForIssue: (issueId: string) => IssueRelationship[];
  getStatus: (statusId: string) => ProjectStatus | undefined;
  getTag: (tagId: string) => Tag | undefined;
  getPullRequestsForIssue: (issueId: string) => PullRequest[];
  getWorkspacesForIssue: (issueId: string) => Workspace[];
  getAttachmentsForIssue: (issueId: string) => Attachment[];
  getAttachmentsForComment: (commentId: string) => Attachment[];
  getBlobForAttachment: (attachment: Attachment) => RemoteBlob | undefined;

  // Computed aggregations (Maps for O(1) lookup)
  issuesById: Map<string, Issue>;
  statusesById: Map<string, ProjectStatus>;
  tagsById: Map<string, Tag>;
}

const ProjectContext = createHmrContext<ProjectContextValue | null>(
  'RemoteProjectContext',
  null
);

interface ProjectProviderProps {
  projectId: string;
  children: ReactNode;
}

export function ProjectProvider({ projectId, children }: ProjectProviderProps) {
  const params = useMemo(() => ({ project_id: projectId }), [projectId]);
  const enabled = Boolean(projectId);

  // Shape subscriptions (with mutations where needed)
  const issuesResult = useShape(PROJECT_ISSUES_SHAPE, params, {
    enabled,
    mutation: ISSUE_MUTATION,
  });
  const statusesResult = useShape(PROJECT_PROJECT_STATUSES_SHAPE, params, {
    enabled,
    mutation: PROJECT_STATUS_MUTATION,
  });
  const tagsResult = useShape(PROJECT_TAGS_SHAPE, params, {
    enabled,
    mutation: TAG_MUTATION,
  });
  const issueAssigneesResult = useShape(PROJECT_ISSUE_ASSIGNEES_SHAPE, params, {
    enabled,
    mutation: ISSUE_ASSIGNEE_MUTATION,
  });
  const issueFollowersResult = useShape(PROJECT_ISSUE_FOLLOWERS_SHAPE, params, {
    enabled,
    mutation: ISSUE_FOLLOWER_MUTATION,
  });
  const issueTagsResult = useShape(PROJECT_ISSUE_TAGS_SHAPE, params, {
    enabled,
    mutation: ISSUE_TAG_MUTATION,
  });
  const issueRelationshipsResult = useShape(
    PROJECT_ISSUE_RELATIONSHIPS_SHAPE,
    params,
    { enabled, mutation: ISSUE_RELATIONSHIP_MUTATION }
  );
  const pullRequestsResult = useShape(PROJECT_PULL_REQUESTS_SHAPE, params, {
    enabled,
  });
  const workspacesResult = useShape(PROJECT_WORKSPACES_SHAPE, params, {
    enabled,
  });
  const blobsResult = useShape(PROJECT_BLOBS_SHAPE, params, { enabled });
  const attachmentsResult = useShape(PROJECT_ATTACHMENTS_SHAPE, params, {
    enabled,
  });

  // Board readiness depends on core kanban data only.
  // Other project-scoped shapes hydrate opportunistically after render.
  const isLoading = issuesResult.isLoading || statusesResult.isLoading;

  // First error found
  const error =
    issuesResult.error ||
    statusesResult.error ||
    tagsResult.error ||
    issueAssigneesResult.error ||
    issueFollowersResult.error ||
    issueTagsResult.error ||
    issueRelationshipsResult.error ||
    pullRequestsResult.error ||
    workspacesResult.error ||
    blobsResult.error ||
    attachmentsResult.error ||
    null;

  // Combined retry
  const retry = useCallback(() => {
    issuesResult.retry();
    statusesResult.retry();
    tagsResult.retry();
    issueAssigneesResult.retry();
    issueFollowersResult.retry();
    issueTagsResult.retry();
    issueRelationshipsResult.retry();
    pullRequestsResult.retry();
    workspacesResult.retry();
    blobsResult.retry();
    attachmentsResult.retry();
  }, [
    issuesResult,
    statusesResult,
    tagsResult,
    issueAssigneesResult,
    issueFollowersResult,
    issueTagsResult,
    issueRelationshipsResult,
    pullRequestsResult,
    workspacesResult,
    blobsResult,
    attachmentsResult,
  ]);

  // Computed Maps for O(1) lookup
  const issuesById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issuesResult.data) {
      map.set(issue.id, issue);
    }
    return map;
  }, [issuesResult.data]);

  const statusesById = useMemo(() => {
    const map = new Map<string, ProjectStatus>();
    for (const status of statusesResult.data) {
      map.set(status.id, status);
    }
    return map;
  }, [statusesResult.data]);

  const tagsById = useMemo(() => {
    const map = new Map<string, Tag>();
    for (const tag of tagsResult.data) {
      map.set(tag.id, tag);
    }
    return map;
  }, [tagsResult.data]);

  // Lookup helpers
  const getIssue = useCallback(
    (issueId: string) => issuesById.get(issueId),
    [issuesById]
  );

  const getIssuesForStatus = useCallback(
    (statusId: string) =>
      issuesResult.data.filter((i) => i.status_id === statusId),
    [issuesResult.data]
  );

  const getAssigneesForIssue = useCallback(
    (issueId: string) =>
      issueAssigneesResult.data.filter((a) => a.issue_id === issueId),
    [issueAssigneesResult.data]
  );

  const getFollowersForIssue = useCallback(
    (issueId: string) =>
      issueFollowersResult.data.filter((f) => f.issue_id === issueId),
    [issueFollowersResult.data]
  );

  const getTagsForIssue = useCallback(
    (issueId: string) =>
      issueTagsResult.data.filter((t) => t.issue_id === issueId),
    [issueTagsResult.data]
  );

  const getTagObjectsForIssue = useCallback(
    (issueId: string) => {
      const issueTags = issueTagsResult.data.filter(
        (t) => t.issue_id === issueId
      );
      return issueTags
        .map((it) => tagsById.get(it.tag_id))
        .filter((t): t is Tag => t !== undefined);
    },
    [issueTagsResult.data, tagsById]
  );

  const getRelationshipsForIssue = useCallback(
    (issueId: string) =>
      issueRelationshipsResult.data.filter(
        (r) => r.issue_id === issueId || r.related_issue_id === issueId
      ),
    [issueRelationshipsResult.data]
  );

  const getStatus = useCallback(
    (statusId: string) => statusesById.get(statusId),
    [statusesById]
  );

  const getTag = useCallback(
    (tagId: string) => tagsById.get(tagId),
    [tagsById]
  );

  const getPullRequestsForIssue = useCallback(
    (issueId: string) =>
      pullRequestsResult.data.filter((pr) => pr.issue_id === issueId),
    [pullRequestsResult.data]
  );

  const getWorkspacesForIssue = useCallback(
    (issueId: string) =>
      workspacesResult.data.filter((w) => w.issue_id === issueId),
    [workspacesResult.data]
  );

  const blobsById = useMemo(() => {
    const map = new Map<string, RemoteBlob>();
    for (const blob of blobsResult.data) {
      map.set(blob.id, blob);
    }
    return map;
  }, [blobsResult.data]);

  const getAttachmentsForIssue = useCallback(
    (issueId: string) =>
      attachmentsResult.data.filter((a) => a.issue_id === issueId),
    [attachmentsResult.data]
  );

  const getAttachmentsForComment = useCallback(
    (commentId: string) =>
      attachmentsResult.data.filter((a) => a.comment_id === commentId),
    [attachmentsResult.data]
  );

  const getBlobForAttachment = useCallback(
    (attachment: Attachment) => blobsById.get(attachment.blob_id),
    [blobsById]
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      projectId,

      // Data
      issues: issuesResult.data,
      statuses: statusesResult.data,
      tags: tagsResult.data,
      issueAssignees: issueAssigneesResult.data,
      issueFollowers: issueFollowersResult.data,
      issueTags: issueTagsResult.data,
      issueRelationships: issueRelationshipsResult.data,
      pullRequests: pullRequestsResult.data,
      workspaces: workspacesResult.data,
      blobs: blobsResult.data,
      attachments: attachmentsResult.data,

      // Loading/error
      isLoading,
      error,
      retry,

      // Issue mutations
      insertIssue: issuesResult.insert,
      updateIssue: issuesResult.update,
      removeIssue: issuesResult.remove,

      // Status mutations
      insertStatus: statusesResult.insert,
      updateStatus: statusesResult.update,
      removeStatus: statusesResult.remove,

      // Tag mutations
      insertTag: tagsResult.insert,
      updateTag: tagsResult.update,
      removeTag: tagsResult.remove,

      // IssueAssignee mutations
      insertIssueAssignee: issueAssigneesResult.insert,
      removeIssueAssignee: issueAssigneesResult.remove,

      // IssueFollower mutations
      insertIssueFollower: issueFollowersResult.insert,
      removeIssueFollower: issueFollowersResult.remove,

      // IssueTag mutations
      insertIssueTag: issueTagsResult.insert,
      removeIssueTag: issueTagsResult.remove,

      // IssueRelationship mutations
      insertIssueRelationship: issueRelationshipsResult.insert,
      removeIssueRelationship: issueRelationshipsResult.remove,

      // Lookup helpers
      getIssue,
      getIssuesForStatus,
      getAssigneesForIssue,
      getFollowersForIssue,
      getTagsForIssue,
      getTagObjectsForIssue,
      getRelationshipsForIssue,
      getStatus,
      getTag,
      getPullRequestsForIssue,
      getWorkspacesForIssue,
      getAttachmentsForIssue,
      getAttachmentsForComment,
      getBlobForAttachment,

      // Computed aggregations
      issuesById,
      statusesById,
      tagsById,
    }),
    [
      projectId,
      issuesResult,
      statusesResult,
      tagsResult,
      issueAssigneesResult,
      issueFollowersResult,
      issueTagsResult,
      issueRelationshipsResult,
      pullRequestsResult,
      workspacesResult,
      blobsResult,
      attachmentsResult,
      isLoading,
      error,
      retry,
      getIssue,
      getIssuesForStatus,
      getAssigneesForIssue,
      getFollowersForIssue,
      getTagsForIssue,
      getTagObjectsForIssue,
      getRelationshipsForIssue,
      getStatus,
      getTag,
      getPullRequestsForIssue,
      getWorkspacesForIssue,
      getAttachmentsForIssue,
      getAttachmentsForComment,
      getBlobForAttachment,
      issuesById,
      statusesById,
      tagsById,
    ]
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

/**
 * Hook to access project context.
 * Must be used within a ProjectProvider.
 */
export function useProjectContext(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
}
