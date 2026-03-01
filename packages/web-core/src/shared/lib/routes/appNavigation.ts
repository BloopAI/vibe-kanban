import type { IssuePriority } from 'shared/remote-types';
import { parseAppPathname } from '@/shared/lib/routes/pathResolution';

type AppNavigationTarget = ReturnType<AppNavigation['toRoot']>;

export type ProjectKanbanSearch = {
  statusId?: string;
  priority?: string;
  assignees?: string;
  parentIssueId?: string;
  mode?: string;
  orgId?: string;
};

type NavigationIntent =
  | { type: 'root'; hostId: string | null }
  | { type: 'onboarding'; hostId: string | null }
  | { type: 'onboarding-sign-in'; hostId: string | null }
  | { type: 'migrate'; hostId: string | null }
  | { type: 'workspaces'; hostId: string | null }
  | { type: 'workspaces-create'; hostId: string | null }
  | { type: 'workspace'; hostId: string | null; workspaceId: string }
  | { type: 'workspace-vscode'; hostId: string | null; workspaceId: string }
  | {
      type: 'project';
      hostId: string | null;
      projectId: string;
      search?: ProjectKanbanSearch;
    }
  | {
      type: 'project-issue-create';
      hostId: string | null;
      projectId: string;
      search?: ProjectKanbanSearch;
    }
  | {
      type: 'project-issue';
      hostId: string | null;
      projectId: string;
      issueId: string;
      search?: ProjectKanbanSearch;
    }
  | {
      type: 'project-issue-workspace';
      hostId: string | null;
      projectId: string;
      issueId: string;
      workspaceId: string;
      search?: ProjectKanbanSearch;
    }
  | {
      type: 'project-issue-workspace-create';
      hostId: string | null;
      projectId: string;
      issueId: string;
      draftId: string;
      search?: ProjectKanbanSearch;
    }
  | {
      type: 'project-workspace-create';
      hostId: string | null;
      projectId: string;
      draftId: string;
      search?: ProjectKanbanSearch;
    };

export interface AppNavigation {
  toRoot(): any;
  toOnboarding(): any;
  toOnboardingSignIn(): any;
  toMigrate(): any;
  toWorkspaces(): any;
  toWorkspacesCreate(): any;
  toWorkspace(workspaceId: string): any;
  toWorkspaceVsCode(workspaceId: string): any;
  toProject(projectId: string, search?: ProjectKanbanSearch): any;
  toProjectIssueCreate(projectId: string, search?: ProjectKanbanSearch): any;
  toProjectIssue(
    projectId: string,
    issueId: string,
    search?: ProjectKanbanSearch
  ): any;
  toProjectIssueWorkspace(
    projectId: string,
    issueId: string,
    workspaceId: string,
    search?: ProjectKanbanSearch
  ): any;
  toProjectIssueWorkspaceCreate(
    projectId: string,
    issueId: string,
    draftId: string,
    search?: ProjectKanbanSearch
  ): any;
  toProjectWorkspaceCreate(
    projectId: string,
    draftId: string,
    search?: ProjectKanbanSearch
  ): any;
  fromPath(path: string): AppNavigationTarget | null;
}

export interface ProjectIssueCreateOptions {
  statusId?: string;
  priority?: IssuePriority;
  assigneeIds?: string[];
  parentIssueId?: string;
}

export function toProjectIssueCreateSearch(
  options?: ProjectIssueCreateOptions
): ProjectKanbanSearch {
  return {
    statusId: options?.statusId,
    priority: options?.priority,
    assignees:
      options?.assigneeIds && options.assigneeIds.length > 0
        ? options.assigneeIds.join(',')
        : undefined,
    parentIssueId: options?.parentIssueId,
  };
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

export function resolveAppNavigationFromPath(
  path: string,
  navigation: AppNavigation,
  options?: {
    resolveHostNavigation?: (hostId: string) => AppNavigation | null;
  }
): AppNavigationTarget | null {
  const intent = parseNavigationIntent(path);
  if (!intent) {
    return null;
  }

  if (intent.hostId && options?.resolveHostNavigation) {
    const hostScopedNavigation = options.resolveHostNavigation(intent.hostId);
    if (hostScopedNavigation) {
      return resolveNavigationIntent(intent, hostScopedNavigation);
    }
  }

  return resolveNavigationIntent(intent, navigation);
}

function hasSearch(search: ProjectKanbanSearch): boolean {
  return Object.keys(search).length > 0;
}

function parseNavigationIntent(path: string): NavigationIntent | null {
  const url = new URL(path, 'http://localhost');
  const pathname = url.pathname;
  const { hostId, segments, offset } = parseAppPathname(pathname);

  if (pathname === '/') return { type: 'root', hostId };
  if (pathname === '/onboarding') return { type: 'onboarding', hostId };
  if (pathname === '/onboarding/sign-in') {
    return { type: 'onboarding-sign-in', hostId };
  }
  if (pathname === '/migrate') return { type: 'migrate', hostId };

  if (segments.length === offset + 1 && segments[offset] === 'workspaces') {
    return { type: 'workspaces', hostId };
  }

  if (
    segments.length === offset + 2 &&
    segments[offset] === 'workspaces' &&
    segments[offset + 1] === 'create'
  ) {
    return { type: 'workspaces-create', hostId };
  }

  if (
    segments.length === offset + 3 &&
    segments[offset] === 'workspaces' &&
    segments[offset + 2] === 'vscode'
  ) {
    return {
      type: 'workspace-vscode',
      hostId,
      workspaceId: segments[offset + 1],
    };
  }

  if (segments.length === offset + 2 && segments[offset] === 'workspaces') {
    return { type: 'workspace', hostId, workspaceId: segments[offset + 1] };
  }

  const kanbanSearch = pruneUndefinedSearch(
    searchParamsToKanbanSearch(url.searchParams)
  );
  const projectSearch = hasSearch(kanbanSearch) ? kanbanSearch : undefined;

  if (segments[offset] !== 'projects' || !segments[offset + 1]) {
    return null;
  }

  const projectId = segments[offset + 1];

  if (segments.length === offset + 2) {
    return { type: 'project', hostId, projectId, search: projectSearch };
  }

  if (segments[offset + 2] === 'issues' && segments[offset + 3] === 'new') {
    return {
      type: 'project-issue-create',
      hostId,
      projectId,
      search: projectSearch,
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
      type: 'project-issue-workspace-create',
      hostId,
      projectId,
      issueId: segments[offset + 3],
      draftId: segments[offset + 6],
      search: projectSearch,
    };
  }

  if (
    segments[offset + 2] === 'issues' &&
    segments[offset + 3] &&
    segments[offset + 4] === 'workspaces' &&
    segments[offset + 5]
  ) {
    return {
      type: 'project-issue-workspace',
      hostId,
      projectId,
      issueId: segments[offset + 3],
      workspaceId: segments[offset + 5],
      search: projectSearch,
    };
  }

  if (segments[offset + 2] === 'issues' && segments[offset + 3]) {
    return {
      type: 'project-issue',
      hostId,
      projectId,
      issueId: segments[offset + 3],
      search: projectSearch,
    };
  }

  if (
    segments[offset + 2] === 'workspaces' &&
    segments[offset + 3] === 'create' &&
    segments[offset + 4]
  ) {
    return {
      type: 'project-workspace-create',
      hostId,
      projectId,
      draftId: segments[offset + 4],
      search: projectSearch,
    };
  }

  return null;
}
function resolveNavigationIntent(
  intent: NavigationIntent,
  navigation: AppNavigation
): AppNavigationTarget | null {
  switch (intent.type) {
    case 'root':
      return navigation.toRoot();
    case 'onboarding':
      return navigation.toOnboarding();
    case 'onboarding-sign-in':
      return navigation.toOnboardingSignIn();
    case 'migrate':
      return navigation.toMigrate();
    case 'workspaces':
      return navigation.toWorkspaces();
    case 'workspaces-create':
      return navigation.toWorkspacesCreate();
    case 'workspace':
      return navigation.toWorkspace(intent.workspaceId);
    case 'workspace-vscode':
      return navigation.toWorkspaceVsCode(intent.workspaceId);
    case 'project':
      return navigation.toProject(intent.projectId, intent.search);
    case 'project-issue-create':
      return navigation.toProjectIssueCreate(intent.projectId, intent.search);
    case 'project-issue':
      return navigation.toProjectIssue(
        intent.projectId,
        intent.issueId,
        intent.search
      );
    case 'project-issue-workspace':
      return navigation.toProjectIssueWorkspace(
        intent.projectId,
        intent.issueId,
        intent.workspaceId,
        intent.search
      );
    case 'project-issue-workspace-create':
      return navigation.toProjectIssueWorkspaceCreate(
        intent.projectId,
        intent.issueId,
        intent.draftId,
        intent.search
      );
    case 'project-workspace-create':
      return navigation.toProjectWorkspaceCreate(
        intent.projectId,
        intent.draftId,
        intent.search
      );
    default:
      return null;
  }
}
