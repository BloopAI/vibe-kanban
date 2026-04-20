import { useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ProjectContext,
  type ProjectContextValue,
} from '@/shared/hooks/useProjectContext';
import type { InsertResult, MutationResult } from '@/shared/lib/electric/types';
import {
  kanbanIssuesApi,
  kanbanStatusesApi,
  kanbanTagsApi,
  kanbanIssueTagsApi,
  kanbanIssueAssigneesApi,
  kanbanIssueRelationshipsApi,
} from '@/shared/lib/kanbanApi';
import type {
  Issue,
  ProjectStatus,
  Tag,
  IssueAssignee,
  IssueFollower,
  IssueTag,
  IssueRelationship,
  PullRequest,
  PullRequestIssue,
  Workspace,
  CreateIssueRequest,
  UpdateIssueRequest,
  CreateProjectStatusRequest,
  UpdateProjectStatusRequest,
  CreateTagRequest,
  UpdateTagRequest,
  CreateIssueAssigneeRequest,
  CreateIssueFollowerRequest,
  CreateIssueTagRequest,
  CreateIssueRelationshipRequest,
  CreatePullRequestIssueRequest,
} from 'shared/remote-types';
import type {
  KanbanIssue,
  KanbanIssueRelationship,
  KanbanProjectStatus,
  KanbanTag,
  KanbanIssueTag,
  KanbanIssueAssignee,
} from 'shared/types';
const uuidv4 = () => crypto.randomUUID();

// Keys for React Query cache
const kanbanKeys = {
  issues: (projectId: string) => ['kanban', 'issues', projectId] as const,
  statuses: (projectId: string) => ['kanban', 'statuses', projectId] as const,
  tags: (projectId: string) => ['kanban', 'tags', projectId] as const,
  issueTags: (projectId: string) =>
    ['kanban', 'issue-tags', projectId] as const,
  issueAssignees: (projectId: string) =>
    ['kanban', 'issue-assignees', projectId] as const,
  issueRelationships: (projectId: string) =>
    ['kanban', 'issue-relationships', projectId] as const,
};

// Adapters: convert local kanban types to cloud-compatible types.
// The structures are identical — we just cast to satisfy the interface.
function adaptIssue(ki: KanbanIssue): Issue {
  return ki as unknown as Issue;
}

function adaptStatus(ks: KanbanProjectStatus): ProjectStatus {
  return ks as unknown as ProjectStatus;
}

function adaptTag(kt: KanbanTag): Tag {
  return kt as unknown as Tag;
}

function adaptIssueTag(kit: KanbanIssueTag): IssueTag {
  return kit as unknown as IssueTag;
}

function adaptAssignee(kia: KanbanIssueAssignee): IssueAssignee {
  return {
    id: kia.id,
    issue_id: kia.issue_id,
    user_id: kia.user_id,
    assigned_at: kia.assigned_at,
  } as unknown as IssueAssignee;
}

function adaptRelationship(kir: KanbanIssueRelationship): IssueRelationship {
  return kir as unknown as IssueRelationship;
}

/** Wraps a promise as a resolved MutationResult (no optimistic update needed). */
function asMutationResult(promise: Promise<unknown>): MutationResult {
  return { persisted: promise.then(() => {}) };
}

interface LocalKanbanProjectProviderProps {
  projectId: string;
  children: ReactNode;
}

/**
 * Local-first implementation of ProjectContextValue.
 * Fetches kanban data from the local REST API and provides
 * the same interface that KanbanContainer and related components consume.
 */
export function LocalKanbanProjectProvider({
  projectId,
  children,
}: LocalKanbanProjectProviderProps) {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['kanban', 'issues', projectId],
    });
    queryClient.invalidateQueries({
      queryKey: ['kanban', 'issue-tags', projectId],
    });
    queryClient.invalidateQueries({
      queryKey: ['kanban', 'issue-assignees', projectId],
    });
    queryClient.invalidateQueries({
      queryKey: ['kanban', 'issue-relationships', projectId],
    });
  }, [queryClient, projectId]);

  // Queries
  const issuesQuery = useQuery({
    queryKey: kanbanKeys.issues(projectId),
    queryFn: () => kanbanIssuesApi.list(projectId),
    staleTime: 5_000,
  });

  const statusesQuery = useQuery({
    queryKey: kanbanKeys.statuses(projectId),
    queryFn: () => kanbanStatusesApi.list(projectId),
    staleTime: 30_000,
  });

  const tagsQuery = useQuery({
    queryKey: kanbanKeys.tags(projectId),
    queryFn: () => kanbanTagsApi.list(projectId),
    staleTime: 30_000,
  });

  // Mutations
  const createIssueMutation = useMutation({
    mutationFn: (data: CreateIssueRequest) =>
      kanbanIssuesApi.create(projectId, {
        id: data.id ?? null,
        status_id: data.status_id,
        title: data.title,
        description: data.description ?? null,
        priority: (data.priority ?? null) as KanbanIssue['priority'],
        start_date: data.start_date ?? null,
        target_date: data.target_date ?? null,
        completed_at: data.completed_at ?? null,
        sort_order: data.sort_order ?? null,
        parent_issue_id: data.parent_issue_id ?? null,
        parent_issue_sort_order: data.parent_issue_sort_order ?? null,
        extension_metadata: data.extension_metadata ?? null,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: kanbanKeys.issues(projectId),
      }),
  });

  const updateIssueMutation = useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string;
      changes: Partial<UpdateIssueRequest>;
    }) =>
      kanbanIssuesApi.update(id, {
        status_id: changes.status_id ?? null,
        title: changes.title ?? null,
        description: changes.description ?? null,
        priority: (changes.priority ?? null) as KanbanIssue['priority'],
        start_date: changes.start_date ?? null,
        target_date: changes.target_date ?? null,
        completed_at: changes.completed_at ?? null,
        sort_order: changes.sort_order ?? null,
        parent_issue_id: changes.parent_issue_id ?? null,
        parent_issue_sort_order: changes.parent_issue_sort_order ?? null,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: kanbanKeys.issues(projectId),
      }),
  });

  const deleteIssueMutation = useMutation({
    mutationFn: (id: string) => kanbanIssuesApi.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: kanbanKeys.issues(projectId),
      }),
  });

  const createStatusMutation = useMutation({
    mutationFn: (data: CreateProjectStatusRequest) =>
      kanbanStatusesApi.create(projectId, {
        id: null,
        name: data.name,
        color: data.color,
        sort_order: data.sort_order ?? null,
        hidden: data.hidden,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: kanbanKeys.statuses(projectId),
      }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string;
      changes: Partial<UpdateProjectStatusRequest>;
    }) =>
      kanbanStatusesApi.update(id, {
        name: changes.name ?? null,
        color: changes.color ?? null,
        sort_order: changes.sort_order ?? null,
        hidden: changes.hidden ?? null,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: kanbanKeys.statuses(projectId),
      }),
  });

  const deleteStatusMutation = useMutation({
    mutationFn: (id: string) => kanbanStatusesApi.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: kanbanKeys.statuses(projectId),
      }),
  });

  const createTagMutation = useMutation({
    mutationFn: (data: CreateTagRequest) =>
      kanbanTagsApi.create(projectId, {
        id: null,
        name: data.name,
        color: data.color,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: kanbanKeys.tags(projectId) }),
  });

  const updateTagMutation = useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string;
      changes: Partial<UpdateTagRequest>;
    }) =>
      kanbanTagsApi.update(id, {
        name: changes.name ?? null,
        color: changes.color ?? null,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: kanbanKeys.tags(projectId) }),
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => kanbanTagsApi.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: kanbanKeys.tags(projectId) }),
  });

  const createIssueTagMutation = useMutation({
    mutationFn: (data: CreateIssueTagRequest) =>
      kanbanIssueTagsApi.create({
        id: null,
        issue_id: data.issue_id,
        tag_id: data.tag_id,
      }),
    onSuccess: invalidateAll,
  });

  const deleteIssueTagMutation = useMutation({
    mutationFn: (id: string) => kanbanIssueTagsApi.delete(id),
    onSuccess: invalidateAll,
  });

  const createAssigneeMutation = useMutation({
    mutationFn: (data: CreateIssueAssigneeRequest) =>
      kanbanIssueAssigneesApi.create({
        id: null,
        issue_id: data.issue_id,
        user_id: data.user_id,
      }),
    onSuccess: invalidateAll,
  });

  const deleteAssigneeMutation = useMutation({
    mutationFn: (id: string) => kanbanIssueAssigneesApi.delete(id),
    onSuccess: invalidateAll,
  });

  const createRelationshipMutation = useMutation({
    mutationFn: (data: CreateIssueRelationshipRequest) =>
      kanbanIssueRelationshipsApi.create({
        id: null,
        issue_id: data.issue_id,
        related_issue_id: data.related_issue_id,
        relationship_type:
          data.relationship_type as KanbanIssueRelationship['relationship_type'],
      }),
    onSuccess: invalidateAll,
  });

  const deleteRelationshipMutation = useMutation({
    mutationFn: (id: string) => kanbanIssueRelationshipsApi.delete(id),
    onSuccess: invalidateAll,
  });

  // Derived data
  const rawIssues = issuesQuery.data ?? [];
  const rawStatuses = statusesQuery.data ?? [];
  const rawTags = tagsQuery.data ?? [];

  const issues = useMemo(() => rawIssues.map(adaptIssue), [rawIssues]);
  const statuses = useMemo(() => rawStatuses.map(adaptStatus), [rawStatuses]);
  const tags = useMemo(() => rawTags.map(adaptTag), [rawTags]);

  // Maps and lookups
  const issuesById = useMemo(
    () => new Map(issues.map((i) => [i.id, i])),
    [issues]
  );
  const statusesById = useMemo(
    () => new Map(statuses.map((s) => [s.id, s])),
    [statuses]
  );
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const isLoading =
    issuesQuery.isLoading || statusesQuery.isLoading || tagsQuery.isLoading;

  const error = issuesQuery.error
    ? { message: String(issuesQuery.error) }
    : null;

  const retry = useCallback(() => {
    issuesQuery.refetch();
    statusesQuery.refetch();
    tagsQuery.refetch();
  }, [issuesQuery, statusesQuery, tagsQuery]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projectId,

      issues,
      statuses,
      tags,
      issueAssignees: [] as IssueAssignee[],
      issueFollowers: [] as IssueFollower[],
      issueTags: [] as IssueTag[],
      issueRelationships: [] as IssueRelationship[],
      pullRequests: [] as PullRequest[],
      pullRequestIssues: [] as PullRequestIssue[],
      workspaces: [] as Workspace[],

      isLoading,
      error,
      retry,

      insertIssue: (data) => {
        const optimisticId = data.id ?? uuidv4();
        const optimisticIssue: Issue = {
          id: optimisticId,
          project_id: projectId,
          issue_number: 0,
          simple_id: 'VK-?',
          status_id: data.status_id,
          title: data.title,
          description: data.description,
          priority: data.priority,
          start_date: data.start_date,
          target_date: data.target_date,
          completed_at: data.completed_at,
          sort_order: data.sort_order,
          parent_issue_id: data.parent_issue_id,
          parent_issue_sort_order: data.parent_issue_sort_order,
          extension_metadata: data.extension_metadata,
          creator_user_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const persisted = createIssueMutation
          .mutateAsync({ ...data, id: optimisticId })
          .then(adaptIssue);
        return {
          data: optimisticIssue,
          persisted,
        } satisfies InsertResult<Issue>;
      },

      updateIssue: (id, changes) => {
        const promise = updateIssueMutation.mutateAsync({ id, changes });
        return asMutationResult(promise);
      },

      removeIssue: (id) => {
        const promise = deleteIssueMutation.mutateAsync(id);
        return asMutationResult(promise);
      },

      insertStatus: (data) => {
        const optimisticId = data.id ?? uuidv4();
        const optimisticStatus: ProjectStatus = {
          id: optimisticId,
          project_id: projectId,
          name: data.name,
          color: data.color,
          sort_order: data.sort_order,
          hidden: data.hidden,
          created_at: new Date().toISOString(),
        };
        const persisted = createStatusMutation
          .mutateAsync(data)
          .then(adaptStatus);
        return {
          data: optimisticStatus,
          persisted,
        } satisfies InsertResult<ProjectStatus>;
      },

      updateStatus: (id, changes) => {
        const promise = updateStatusMutation.mutateAsync({ id, changes });
        return asMutationResult(promise);
      },

      removeStatus: (id) => {
        const promise = deleteStatusMutation.mutateAsync(id);
        return asMutationResult(promise);
      },

      insertTag: (data) => {
        const optimisticId = data.id ?? uuidv4();
        const optimisticTag: Tag = {
          id: optimisticId,
          project_id: projectId,
          name: data.name,
          color: data.color,
        };
        const persisted = createTagMutation.mutateAsync(data).then(adaptTag);
        return {
          data: optimisticTag,
          persisted,
        } satisfies InsertResult<Tag>;
      },

      updateTag: (id, changes) => {
        const promise = updateTagMutation.mutateAsync({ id, changes });
        return asMutationResult(promise);
      },

      removeTag: (id) => {
        const promise = deleteTagMutation.mutateAsync(id);
        return asMutationResult(promise);
      },

      insertIssueAssignee: (data) => {
        const optimisticId = data.id ?? uuidv4();
        const optimisticAssignee: IssueAssignee = {
          id: optimisticId,
          issue_id: data.issue_id,
          user_id: data.user_id,
          assigned_at: new Date().toISOString(),
        };
        const persisted = createAssigneeMutation
          .mutateAsync(data)
          .then(adaptAssignee);
        return {
          data: optimisticAssignee,
          persisted,
        } satisfies InsertResult<IssueAssignee>;
      },

      removeIssueAssignee: (id) => {
        const promise = deleteAssigneeMutation.mutateAsync(id);
        return asMutationResult(promise);
      },

      insertIssueFollower: (_data: CreateIssueFollowerRequest) => {
        const noop: IssueFollower = {
          id: uuidv4(),
          issue_id: _data.issue_id,
          user_id: _data.user_id,
        };
        return {
          data: noop,
          persisted: Promise.resolve(noop),
        } satisfies InsertResult<IssueFollower>;
      },

      removeIssueFollower: (_id: string) => ({
        persisted: Promise.resolve(),
      }),

      insertIssueTag: (data) => {
        const optimisticId = data.id ?? uuidv4();
        const optimisticIssueTag: IssueTag = {
          id: optimisticId,
          issue_id: data.issue_id,
          tag_id: data.tag_id,
        };
        const persisted = createIssueTagMutation
          .mutateAsync(data)
          .then(adaptIssueTag);
        return {
          data: optimisticIssueTag,
          persisted,
        } satisfies InsertResult<IssueTag>;
      },

      removeIssueTag: (id) => {
        const promise = deleteIssueTagMutation.mutateAsync(id);
        return asMutationResult(promise);
      },

      insertIssueRelationship: (data) => {
        const optimisticId = data.id ?? uuidv4();
        const optimisticRel: IssueRelationship = {
          id: optimisticId,
          issue_id: data.issue_id,
          related_issue_id: data.related_issue_id,
          relationship_type: data.relationship_type,
          created_at: new Date().toISOString(),
        };
        const persisted = createRelationshipMutation
          .mutateAsync(data)
          .then(adaptRelationship);
        return {
          data: optimisticRel,
          persisted,
        } satisfies InsertResult<IssueRelationship>;
      },

      removeIssueRelationship: (id) => {
        const promise = deleteRelationshipMutation.mutateAsync(id);
        return asMutationResult(promise);
      },

      insertPullRequestIssue: (_data: CreatePullRequestIssueRequest) => {
        const noop: PullRequestIssue = {
          id: uuidv4(),
          pull_request_id: uuidv4(),
          issue_id: _data.issue_id,
        };
        return {
          data: noop,
          persisted: Promise.resolve(noop),
        } satisfies InsertResult<PullRequestIssue>;
      },

      removePullRequestIssue: (_id: string) => ({
        persisted: Promise.resolve(),
      }),

      // Lookups
      getIssue: (issueId) => issuesById.get(issueId),
      getIssuesForStatus: (statusId) =>
        issues.filter((i) => i.status_id === statusId),
      getAssigneesForIssue: (_issueId) => [],
      getFollowersForIssue: (_issueId) => [],
      getTagsForIssue: (_issueId) => [],
      getTagObjectsForIssue: (_issueId) => [],
      getRelationshipsForIssue: (_issueId) => [],
      getStatus: (statusId) => statusesById.get(statusId),
      getTag: (tagId) => tagsById.get(tagId),
      getPullRequestsForIssue: (_issueId) => [],
      getWorkspacesForIssue: (_issueId) => [],

      issuesById,
      statusesById,
      tagsById,
    }),
    [
      projectId,
      issues,
      statuses,
      tags,
      isLoading,
      error,
      retry,
      issuesById,
      statusesById,
      tagsById,
      createIssueMutation,
      updateIssueMutation,
      deleteIssueMutation,
      createStatusMutation,
      updateStatusMutation,
      deleteStatusMutation,
      createTagMutation,
      updateTagMutation,
      deleteTagMutation,
      createIssueTagMutation,
      deleteIssueTagMutation,
      createAssigneeMutation,
      deleteAssigneeMutation,
      createRelationshipMutation,
      deleteRelationshipMutation,
    ]
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}
