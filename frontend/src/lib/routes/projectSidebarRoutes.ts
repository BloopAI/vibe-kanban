import { matchPath } from 'react-router-dom';
import type { IssuePriority } from 'shared/remote-types';

export type ProjectSidebarRouteState =
  | {
      type: 'closed';
      projectId: string;
    }
  | {
      type: 'issue-create';
      projectId: string;
    }
  | {
      type: 'issue';
      projectId: string;
      issueId: string;
    }
  | {
      type: 'issue-workspace';
      projectId: string;
      issueId: string;
      workspaceId: string;
    }
  | {
      type: 'workspace-create';
      projectId: string;
      draftId: string;
      issueId: string | null;
    };

export interface IssueCreateRouteOptions {
  statusId?: string;
  priority?: IssuePriority;
  assigneeIds?: string[];
  parentIssueId?: string;
}

function withSearch(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildProjectRootPath(projectId: string): string {
  return `/projects/${projectId}`;
}

export function buildIssuePath(projectId: string, issueId: string): string {
  return `/projects/${projectId}/issues/${issueId}`;
}

export function buildIssueWorkspacePath(
  projectId: string,
  issueId: string,
  workspaceId: string
): string {
  return `/projects/${projectId}/issues/${issueId}/workspaces/${workspaceId}`;
}

export function buildWorkspaceCreatePath(
  projectId: string,
  draftId: string,
  issueId?: string | null
): string {
  if (issueId) {
    return `/projects/${projectId}/issues/${issueId}/workspaces/create/${draftId}`;
  }
  return `/projects/${projectId}/workspaces/create/${draftId}`;
}

export function buildIssueCreatePath(
  projectId: string,
  options?: IssueCreateRouteOptions
): string {
  const params = new URLSearchParams();
  if (options?.statusId) params.set('statusId', options.statusId);
  if (options?.priority) params.set('priority', options.priority);
  if (options?.assigneeIds?.length) {
    params.set('assignees', options.assigneeIds.join(','));
  }
  if (options?.parentIssueId)
    params.set('parentIssueId', options.parentIssueId);
  return withSearch(`/projects/${projectId}/issues/new`, params);
}

export function parseProjectSidebarRoute(
  pathname: string
): ProjectSidebarRouteState | null {
  const issueWorkspaceCreateMatch = matchPath(
    '/projects/:projectId/issues/:issueId/workspaces/create/:draftId',
    pathname
  );
  if (
    issueWorkspaceCreateMatch?.params.projectId &&
    issueWorkspaceCreateMatch.params.issueId &&
    issueWorkspaceCreateMatch.params.draftId
  ) {
    return {
      type: 'workspace-create',
      projectId: issueWorkspaceCreateMatch.params.projectId,
      issueId: issueWorkspaceCreateMatch.params.issueId,
      draftId: issueWorkspaceCreateMatch.params.draftId,
    };
  }

  const workspaceCreateMatch = matchPath(
    '/projects/:projectId/workspaces/create/:draftId',
    pathname
  );
  if (
    workspaceCreateMatch?.params.projectId &&
    workspaceCreateMatch.params.draftId
  ) {
    return {
      type: 'workspace-create',
      projectId: workspaceCreateMatch.params.projectId,
      issueId: null,
      draftId: workspaceCreateMatch.params.draftId,
    };
  }

  const issueWorkspaceMatch = matchPath(
    '/projects/:projectId/issues/:issueId/workspaces/:workspaceId',
    pathname
  );
  if (
    issueWorkspaceMatch?.params.projectId &&
    issueWorkspaceMatch.params.issueId &&
    issueWorkspaceMatch.params.workspaceId
  ) {
    return {
      type: 'issue-workspace',
      projectId: issueWorkspaceMatch.params.projectId,
      issueId: issueWorkspaceMatch.params.issueId,
      workspaceId: issueWorkspaceMatch.params.workspaceId,
    };
  }

  const issueCreateMatch = matchPath(
    '/projects/:projectId/issues/new',
    pathname
  );
  if (issueCreateMatch?.params.projectId) {
    return {
      type: 'issue-create',
      projectId: issueCreateMatch.params.projectId,
    };
  }

  const issueMatch = matchPath(
    '/projects/:projectId/issues/:issueId',
    pathname
  );
  if (issueMatch?.params.projectId && issueMatch.params.issueId) {
    return {
      type: 'issue',
      projectId: issueMatch.params.projectId,
      issueId: issueMatch.params.issueId,
    };
  }

  const projectMatch = matchPath('/projects/:projectId', pathname);
  if (projectMatch?.params.projectId) {
    return {
      type: 'closed',
      projectId: projectMatch.params.projectId,
    };
  }

  return null;
}
