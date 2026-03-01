export type ProjectKanbanSearch = {
  statusId?: string;
  priority?: string;
  assignees?: string;
  parentIssueId?: string;
  mode?: string;
  orgId?: string;
};

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getHostIdFromCurrentPath(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const segments = window.location.pathname
    .split('/')
    .filter(Boolean)
    .map(decodePathSegment);
  if (segments[0] !== 'hosts' || !segments[1]) {
    return null;
  }

  return segments[1];
}

function resolveHostId(hostId?: string | null): string | null {
  return hostId ?? getHostIdFromCurrentPath();
}

export function toRoot() {
  return { to: '/' } as const;
}

export function toOnboarding() {
  return { to: '/onboarding' } as const;
}

export function toOnboardingSignIn() {
  return { to: '/onboarding/sign-in' } as const;
}

export function toMigrate() {
  return { to: '/migrate' } as const;
}

export function toWorkspaces(hostId?: string | null) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/workspaces',
      params: { hostId: resolvedHostId },
    } as any;
  }

  return { to: '/workspaces' } as const;
}

export function toWorkspacesCreate(hostId?: string | null) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/workspaces/create',
      params: { hostId: resolvedHostId },
    } as any;
  }

  return { to: '/workspaces/create' } as const;
}

export function toWorkspace(workspaceId: string, hostId?: string | null) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/workspaces/$workspaceId',
      params: { hostId: resolvedHostId, workspaceId },
    } as any;
  }

  return {
    to: '/workspaces/$workspaceId',
    params: { workspaceId },
  } as any;
}

export function toWorkspaceVsCode(workspaceId: string, hostId?: string | null) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/workspaces/$workspaceId/vscode',
      params: { hostId: resolvedHostId, workspaceId },
    } as any;
  }

  return {
    to: '/workspaces/$workspaceId/vscode',
    params: { workspaceId },
  } as any;
}

export function toProject(
  projectId: string,
  search?: ProjectKanbanSearch,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId',
      params: { hostId: resolvedHostId, projectId },
      ...(search ? { search } : {}),
    } as any;
  }

  return {
    to: '/projects/$projectId',
    params: { projectId },
    ...(search ? { search } : {}),
  } as any;
}

export function toProjectIssueCreate(
  projectId: string,
  search?: ProjectKanbanSearch,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId/issues/new',
      params: { hostId: resolvedHostId, projectId },
      ...(search ? { search } : {}),
    } as any;
  }

  return {
    to: '/projects/$projectId/issues/new',
    params: { projectId },
    ...(search ? { search } : {}),
  } as any;
}

export function toProjectIssue(
  projectId: string,
  issueId: string,
  search?: ProjectKanbanSearch,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId/issues/$issueId',
      params: { hostId: resolvedHostId, projectId, issueId },
      ...(search ? { search } : {}),
    } as any;
  }

  return {
    to: '/projects/$projectId/issues/$issueId',
    params: { projectId, issueId },
    ...(search ? { search } : {}),
  } as any;
}

export function toProjectIssueWorkspace(
  projectId: string,
  issueId: string,
  workspaceId: string,
  search?: ProjectKanbanSearch,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId/issues/$issueId/workspaces/$workspaceId',
      params: { hostId: resolvedHostId, projectId, issueId, workspaceId },
      ...(search ? { search } : {}),
    } as any;
  }

  return {
    to: '/projects/$projectId/issues/$issueId/workspaces/$workspaceId',
    params: { projectId, issueId, workspaceId },
    ...(search ? { search } : {}),
  } as any;
}

export function toProjectIssueWorkspaceCreate(
  projectId: string,
  issueId: string,
  draftId: string,
  search?: ProjectKanbanSearch,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId/issues/$issueId/workspaces/create/$draftId',
      params: { hostId: resolvedHostId, projectId, issueId, draftId },
      ...(search ? { search } : {}),
    } as any;
  }

  return {
    to: '/projects/$projectId/issues/$issueId/workspaces/create/$draftId',
    params: { projectId, issueId, draftId },
    ...(search ? { search } : {}),
  } as any;
}

export function toProjectWorkspaceCreate(
  projectId: string,
  draftId: string,
  search?: ProjectKanbanSearch,
  hostId?: string | null
) {
  const resolvedHostId = resolveHostId(hostId);
  if (resolvedHostId) {
    return {
      to: '/hosts/$hostId/projects/$projectId/workspaces/create/$draftId',
      params: { hostId: resolvedHostId, projectId, draftId },
      ...(search ? { search } : {}),
    } as any;
  }

  return {
    to: '/projects/$projectId/workspaces/create/$draftId',
    params: { projectId, draftId },
    ...(search ? { search } : {}),
  } as any;
}

export function pruneUndefinedSearch(search: ProjectKanbanSearch) {
  return Object.fromEntries(
    Object.entries(search).filter(([, value]) => value !== undefined)
  ) as ProjectKanbanSearch;
}

export function searchParamsToKanbanSearch(
  params: URLSearchParams
): ProjectKanbanSearch {
  return pruneUndefinedSearch({
    statusId: params.get('statusId') ?? undefined,
    priority: params.get('priority') ?? undefined,
    assignees: params.get('assignees') ?? undefined,
    parentIssueId: params.get('parentIssueId') ?? undefined,
    mode: params.get('mode') ?? undefined,
    orgId: params.get('orgId') ?? undefined,
  });
}
