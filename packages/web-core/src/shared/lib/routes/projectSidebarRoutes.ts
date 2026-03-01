import type { IssuePriority } from 'shared/remote-types';

export type ProjectSidebarRouteState =
  | {
      type: 'closed';
      hostId: string | null;
      projectId: string;
    }
  | {
      type: 'issue-create';
      hostId: string | null;
      projectId: string;
    }
  | {
      type: 'issue';
      hostId: string | null;
      projectId: string;
      issueId: string;
    }
  | {
      type: 'issue-workspace';
      hostId: string | null;
      projectId: string;
      issueId: string;
      workspaceId: string;
    }
  | {
      type: 'workspace-create';
      hostId: string | null;
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

function getHostIdFromCurrentPath(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const segments = window.location.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(decodeSegment);
  if (segments[0] !== 'hosts' || !segments[1]) {
    return null;
  }

  return segments[1];
}

function resolveHostId(hostId?: string | null): string | null {
  return hostId ?? getHostIdFromCurrentPath();
}

export function buildProjectRootPath(
  projectId: string,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId',
      params: { hostId: resolvedHostId, projectId },
    } as any;
  }

  return {
    to: '/projects/$projectId',
    params: { projectId },
  } as any;
}

export function buildIssuePath(
  projectId: string,
  issueId: string,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId/issues/$issueId',
      params: { hostId: resolvedHostId, projectId, issueId },
    } as any;
  }

  return {
    to: '/projects/$projectId/issues/$issueId',
    params: { projectId, issueId },
  } as any;
}

export function buildIssueWorkspacePath(
  projectId: string,
  issueId: string,
  workspaceId: string,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId/issues/$issueId/workspaces/$workspaceId',
      params: { hostId: resolvedHostId, projectId, issueId, workspaceId },
    } as any;
  }

  return {
    to: '/projects/$projectId/issues/$issueId/workspaces/$workspaceId',
    params: { projectId, issueId, workspaceId },
  } as any;
}

export function buildWorkspaceCreatePath(
  projectId: string,
  draftId: string,
  issueId?: string | null,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);

  if (resolvedHostId && issueId) {
    return {
      to: '/hosts/$hostId/projects/$projectId/issues/$issueId/workspaces/create/$draftId',
      params: {
        hostId: resolvedHostId,
        projectId,
        issueId,
        draftId,
      },
    } as any;
  }

  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId/workspaces/create/$draftId',
      params: { hostId: resolvedHostId, projectId, draftId },
    } as any;
  }

  if (issueId) {
    return {
      to: '/projects/$projectId/issues/$issueId/workspaces/create/$draftId',
      params: { projectId, issueId, draftId },
    } as any;
  }

  return {
    to: '/projects/$projectId/workspaces/create/$draftId',
    params: { projectId, draftId },
  } as any;
}

export function buildIssueCreatePath(
  projectId: string,
  options?: IssueCreateRouteOptions,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId/issues/new',
      params: { hostId: resolvedHostId, projectId },
      search: {
        statusId: options?.statusId,
        priority: options?.priority,
        assignees: options?.assigneeIds?.length
          ? options.assigneeIds.join(',')
          : undefined,
        parentIssueId: options?.parentIssueId,
      },
    } as any;
  }

  return {
    to: '/projects/$projectId/issues/new',
    params: { projectId },
    search: {
      statusId: options?.statusId,
      priority: options?.priority,
      assignees: options?.assigneeIds?.length
        ? options.assigneeIds.join(',')
        : undefined,
      parentIssueId: options?.parentIssueId,
    },
  } as any;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseProjectSidebarRoute(
  pathname: string
): ProjectSidebarRouteState | null {
  const segments = pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(decodeSegment);

  const isHostScoped = segments[0] === 'hosts' && !!segments[1];
  const offset = isHostScoped ? 2 : 0;
  const hostId = isHostScoped ? segments[1] : null;

  if (segments[offset] !== 'projects' || !segments[offset + 1]) {
    return null;
  }

  const projectId = segments[offset + 1];

  if (segments.length === offset + 2) {
    return {
      type: 'closed',
      hostId,
      projectId,
    };
  }

  if (segments[offset + 2] === 'issues' && segments[offset + 3] === 'new') {
    return {
      type: 'issue-create',
      hostId,
      projectId,
    };
  }

  if (
    segments[offset + 2] === 'issues' &&
    segments[offset + 3] &&
    segments[offset + 4] === 'workspaces' &&
    segments[offset + 5] === 'create' &&
    segments[offset + 6]
  ) {
    return {
      type: 'workspace-create',
      hostId,
      projectId,
      issueId: segments[offset + 3],
      draftId: segments[offset + 6],
    };
  }

  if (
    segments[offset + 2] === 'issues' &&
    segments[offset + 3] &&
    segments[offset + 4] === 'workspaces' &&
    segments[offset + 5]
  ) {
    return {
      type: 'issue-workspace',
      hostId,
      projectId,
      issueId: segments[offset + 3],
      workspaceId: segments[offset + 5],
    };
  }

  if (segments[offset + 2] === 'issues' && segments[offset + 3]) {
    return {
      type: 'issue',
      hostId,
      projectId,
      issueId: segments[offset + 3],
    };
  }

  if (
    segments[offset + 2] === 'workspaces' &&
    segments[offset + 3] === 'create' &&
    segments[offset + 4]
  ) {
    return {
      type: 'workspace-create',
      hostId,
      projectId,
      issueId: null,
      draftId: segments[offset + 4],
    };
  }

  return null;
}
