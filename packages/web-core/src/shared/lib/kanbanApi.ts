/**
 * Local REST API client for kanban boards.
 * All calls go to the local backend at /api/kanban/*.
 */
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';
import type {
  KanbanProject,
  CreateKanbanProject,
  UpdateKanbanProject,
  KanbanProjectStatus,
  CreateKanbanProjectStatus,
  UpdateKanbanProjectStatus,
  KanbanIssue,
  CreateKanbanIssue,
  UpdateKanbanIssue,
  BulkUpdateKanbanIssueItem,
  KanbanTag,
  CreateKanbanTag,
  UpdateKanbanTag,
  KanbanIssueTag,
  CreateKanbanIssueTag,
  KanbanIssueAssignee,
  CreateKanbanIssueAssignee,
  KanbanIssueRelationship,
  CreateKanbanIssueRelationship,
  ApiResponse,
} from 'shared/types';

async function jsonRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await makeLocalApiRequest(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body?.message ?? `Request failed: ${res.status}`);
  }
  const envelope: ApiResponse<T> = await res.json();
  if (envelope.data === null || envelope.data === undefined) {
    return undefined as unknown as T;
  }
  return envelope.data;
}

// Projects
export const kanbanProjectsApi = {
  list: () => jsonRequest<KanbanProject[]>('/api/kanban/projects'),
  get: (id: string) => jsonRequest<KanbanProject>(`/api/kanban/projects/${id}`),
  create: (data: CreateKanbanProject) =>
    jsonRequest<KanbanProject>('/api/kanban/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateKanbanProject) =>
    jsonRequest<KanbanProject>(`/api/kanban/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    jsonRequest<void>(`/api/kanban/projects/${id}`, { method: 'DELETE' }),
};

// Statuses
export const kanbanStatusesApi = {
  list: (projectId: string) =>
    jsonRequest<KanbanProjectStatus[]>(
      `/api/kanban/projects/${projectId}/statuses`
    ),
  create: (
    projectId: string,
    data: Omit<CreateKanbanProjectStatus, 'project_id'>
  ) =>
    jsonRequest<KanbanProjectStatus>(
      `/api/kanban/projects/${projectId}/statuses`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  update: (id: string, data: UpdateKanbanProjectStatus) =>
    jsonRequest<KanbanProjectStatus>(`/api/kanban/statuses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    jsonRequest<void>(`/api/kanban/statuses/${id}`, { method: 'DELETE' }),
};

// Issues
export const kanbanIssuesApi = {
  list: (projectId: string) =>
    jsonRequest<KanbanIssue[]>(`/api/kanban/projects/${projectId}/issues`),
  get: (id: string) => jsonRequest<KanbanIssue>(`/api/kanban/issues/${id}`),
  create: (projectId: string, data: Omit<CreateKanbanIssue, 'project_id'>) =>
    jsonRequest<KanbanIssue>(`/api/kanban/projects/${projectId}/issues`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateKanbanIssue) =>
    jsonRequest<KanbanIssue>(`/api/kanban/issues/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  bulkUpdate: (updates: BulkUpdateKanbanIssueItem[]) =>
    jsonRequest<void>('/api/kanban/issues/bulk', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    }),
  delete: (id: string) =>
    jsonRequest<void>(`/api/kanban/issues/${id}`, { method: 'DELETE' }),
};

// Tags
export const kanbanTagsApi = {
  list: (projectId: string) =>
    jsonRequest<KanbanTag[]>(`/api/kanban/projects/${projectId}/tags`),
  create: (projectId: string, data: Omit<CreateKanbanTag, 'project_id'>) =>
    jsonRequest<KanbanTag>(`/api/kanban/projects/${projectId}/tags`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateKanbanTag) =>
    jsonRequest<KanbanTag>(`/api/kanban/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    jsonRequest<void>(`/api/kanban/tags/${id}`, { method: 'DELETE' }),
};

// Issue tags
export const kanbanIssueTagsApi = {
  create: (data: CreateKanbanIssueTag) =>
    jsonRequest<KanbanIssueTag>('/api/kanban/issue-tags', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    jsonRequest<void>(`/api/kanban/issue-tags/${id}`, { method: 'DELETE' }),
};

// Issue assignees
export const kanbanIssueAssigneesApi = {
  create: (data: CreateKanbanIssueAssignee) =>
    jsonRequest<KanbanIssueAssignee>('/api/kanban/issue-assignees', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    jsonRequest<void>(`/api/kanban/issue-assignees/${id}`, {
      method: 'DELETE',
    }),
};

// Issue relationships
export const kanbanIssueRelationshipsApi = {
  create: (data: CreateKanbanIssueRelationship) =>
    jsonRequest<KanbanIssueRelationship>('/api/kanban/issue-relationships', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    jsonRequest<void>(`/api/kanban/issue-relationships/${id}`, {
      method: 'DELETE',
    }),
};
