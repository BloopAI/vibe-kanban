import {
  toMigrate,
  toOnboarding,
  toOnboardingSignIn,
  toProject,
  toProjectIssue,
  toProjectIssueCreate,
  toProjectIssueWorkspace,
  toProjectIssueWorkspaceCreate,
  toProjectWorkspaceCreate,
  toRoot,
  toWorkspace,
  toWorkspaceVsCode,
  toWorkspaces,
  toWorkspacesCreate,
  type ProjectKanbanSearch,
  pruneUndefinedSearch,
  searchParamsToKanbanSearch,
} from '@/shared/lib/routes/navigation';

type RouteTarget = ReturnType<
  | typeof toRoot
  | typeof toOnboarding
  | typeof toOnboardingSignIn
  | typeof toMigrate
  | typeof toWorkspaces
  | typeof toWorkspacesCreate
  | typeof toWorkspace
  | typeof toWorkspaceVsCode
  | typeof toProject
  | typeof toProjectIssueCreate
  | typeof toProjectIssue
  | typeof toProjectIssueWorkspace
  | typeof toProjectIssueWorkspaceCreate
  | typeof toProjectWorkspaceCreate
>;

function hasSearch(search: ProjectKanbanSearch): boolean {
  return Object.keys(search).length > 0;
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface ParsedAppPathname {
  hostId: string | null;
  segments: string[];
  offset: number;
}

export function parseAppPathname(pathname: string): ParsedAppPathname {
  const segments = pathname.split('/').filter(Boolean).map(decodePathSegment);
  const hostId = segments[0] === 'hosts' && segments[1] ? segments[1] : null;
  const offset = hostId ? 2 : 0;

  return { hostId, segments, offset };
}

export function isProjectPathname(pathname: string): boolean {
  const { segments, offset } = parseAppPathname(pathname);
  return segments[offset] === 'projects' && Boolean(segments[offset + 1]);
}

export function getProjectIdFromPathname(pathname: string): string | null {
  const { segments, offset } = parseAppPathname(pathname);
  if (segments[offset] !== 'projects' || !segments[offset + 1]) {
    return null;
  }

  return segments[offset + 1];
}

export function isWorkspacesPathname(pathname: string): boolean {
  const { segments, offset } = parseAppPathname(pathname);
  return segments[offset] === 'workspaces';
}

export function isWorkspacesCreatePathname(pathname: string): boolean {
  const { segments, offset } = parseAppPathname(pathname);
  return (
    segments.length === offset + 2 &&
    segments[offset] === 'workspaces' &&
    segments[offset + 1] === 'create'
  );
}

export function resolveAppPath(path: string): RouteTarget | null {
  const url = new URL(path, 'http://localhost');
  const pathname = url.pathname;
  const { segments, hostId, offset } = parseAppPathname(pathname);

  if (pathname === '/') return toRoot();
  if (pathname === '/onboarding') return toOnboarding();
  if (pathname === '/onboarding/sign-in') return toOnboardingSignIn();
  if (pathname === '/migrate') return toMigrate();
  if (
    (offset === 0 && pathname === '/workspaces') ||
    (hostId && pathname === `/hosts/${hostId}/workspaces`)
  ) {
    return toWorkspaces(hostId);
  }
  if (
    (offset === 0 && pathname === '/workspaces/create') ||
    (hostId && pathname === `/hosts/${hostId}/workspaces/create`)
  ) {
    return toWorkspacesCreate(hostId);
  }

  if (
    segments.length === offset + 3 &&
    segments[offset] === 'workspaces' &&
    segments[offset + 2] === 'vscode'
  ) {
    return toWorkspaceVsCode(segments[offset + 1], hostId);
  }

  if (segments.length === offset + 2 && segments[offset] === 'workspaces') {
    return toWorkspace(segments[offset + 1], hostId);
  }

  const kanbanSearch = pruneUndefinedSearch(
    searchParamsToKanbanSearch(url.searchParams)
  );
  const projectSearch = hasSearch(kanbanSearch) ? kanbanSearch : undefined;

  if (segments[offset] === 'projects' && segments[offset + 1]) {
    const projectId = segments[offset + 1];

    if (segments.length === offset + 2) {
      return toProject(projectId, projectSearch, hostId);
    }

    if (segments[offset + 2] === 'issues' && segments[offset + 3] === 'new') {
      return toProjectIssueCreate(projectId, projectSearch, hostId);
    }

    if (
      segments[offset + 2] === 'issues' &&
      segments[offset + 3] &&
      segments[offset + 4] === 'workspaces' &&
      segments[offset + 5] === 'create' &&
      segments[offset + 6]
    ) {
      return toProjectIssueWorkspaceCreate(
        projectId,
        segments[offset + 3],
        segments[offset + 6],
        projectSearch,
        hostId
      );
    }

    if (
      segments[offset + 2] === 'issues' &&
      segments[offset + 3] &&
      segments[offset + 4] === 'workspaces' &&
      segments[offset + 5]
    ) {
      return toProjectIssueWorkspace(
        projectId,
        segments[offset + 3],
        segments[offset + 5],
        projectSearch,
        hostId
      );
    }

    if (segments[offset + 2] === 'issues' && segments[offset + 3]) {
      return toProjectIssue(
        projectId,
        segments[offset + 3],
        projectSearch,
        hostId
      );
    }

    if (
      segments[offset + 2] === 'workspaces' &&
      segments[offset + 3] === 'create' &&
      segments[offset + 4]
    ) {
      return toProjectWorkspaceCreate(
        projectId,
        segments[offset + 4],
        projectSearch,
        hostId
      );
    }
  }

  return null;
}
