import type { IssuePriority } from 'shared/remote-types';
import { parseAppPathname } from '@/shared/lib/routes/pathResolution';

export type ProjectKanbanSearch = {
  statusId?: string;
  priority?: string;
  assignees?: string;
  parentIssueId?: string;
  mode?: string;
  orgId?: string;
};

export type AppDestination =
  | { kind: 'root' }
  | { kind: 'onboarding' }
  | { kind: 'onboarding-sign-in' }
  | { kind: 'migrate' }
  | { kind: 'workspaces'; hostId?: string }
  | { kind: 'workspaces-create'; hostId?: string }
  | { kind: 'workspace'; workspaceId: string; hostId?: string }
  | { kind: 'workspace-vscode'; workspaceId: string; hostId?: string }
  | {
      kind: 'project';
      projectId: string;
      hostId?: string;
      search?: ProjectKanbanSearch;
    }
  | {
      kind: 'project-issue-create';
      projectId: string;
      hostId?: string;
      search?: ProjectKanbanSearch;
    }
  | {
      kind: 'project-issue';
      projectId: string;
      issueId: string;
      hostId?: string;
      search?: ProjectKanbanSearch;
    }
  | {
      kind: 'project-issue-workspace';
      projectId: string;
      issueId: string;
      workspaceId: string;
      hostId?: string;
      search?: ProjectKanbanSearch;
    }
  | {
      kind: 'project-issue-workspace-create';
      projectId: string;
      issueId: string;
      draftId: string;
      hostId?: string;
      search?: ProjectKanbanSearch;
    }
  | {
      kind: 'project-workspace-create';
      projectId: string;
      draftId: string;
      hostId?: string;
      search?: ProjectKanbanSearch;
    };

export type NavigationTransition = {
  replace?: boolean;
  state?:
    | Record<string, unknown>
    | ((previous: unknown) => Record<string, unknown>);
};

export interface AppNavigation {
  navigate(
    destination: AppDestination,
    transition?: NavigationTransition
  ): void;
  resolveFromPath(path: string): AppDestination | null;
  toRoot(): AppDestination;
  toOnboarding(): AppDestination;
  toOnboardingSignIn(): AppDestination;
  toMigrate(): AppDestination;
  toWorkspaces(): AppDestination;
  toWorkspacesCreate(): AppDestination;
  toWorkspace(workspaceId: string): AppDestination;
  toWorkspaceVsCode(workspaceId: string): AppDestination;
  toProject(projectId: string, search?: ProjectKanbanSearch): AppDestination;
  toProjectIssueCreate(
    projectId: string,
    search?: ProjectKanbanSearch
  ): AppDestination;
  toProjectIssue(
    projectId: string,
    issueId: string,
    search?: ProjectKanbanSearch
  ): AppDestination;
  toProjectIssueWorkspace(
    projectId: string,
    issueId: string,
    workspaceId: string,
    search?: ProjectKanbanSearch
  ): AppDestination;
  toProjectIssueWorkspaceCreate(
    projectId: string,
    issueId: string,
    draftId: string,
    search?: ProjectKanbanSearch
  ): AppDestination;
  toProjectWorkspaceCreate(
    projectId: string,
    draftId: string,
    search?: ProjectKanbanSearch
  ): AppDestination;
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

type HostAwareDestination = Exclude<
  AppDestination,
  | { kind: 'root' }
  | { kind: 'onboarding' }
  | { kind: 'onboarding-sign-in' }
  | { kind: 'migrate' }
>;

function withHost<T extends HostAwareDestination>(
  hostId: string | null,
  destination: T
): T {
  return hostId ? { ...destination, hostId } : destination;
}

export function resolveAppDestinationFromPath(
  path: string
): AppDestination | null {
  const url = new URL(path, 'http://localhost');
  const pathname = url.pathname;
  const { hostId, segments, offset } = parseAppPathname(pathname);

  if (pathname === '/') return { kind: 'root' };
  if (pathname === '/onboarding') return { kind: 'onboarding' };
  if (pathname === '/onboarding/sign-in') return { kind: 'onboarding-sign-in' };
  if (pathname === '/migrate') return { kind: 'migrate' };

  if (segments.length === offset + 1 && segments[offset] === 'workspaces') {
    return withHost(hostId, { kind: 'workspaces' });
  }

  if (
    segments.length === offset + 2 &&
    segments[offset] === 'workspaces' &&
    segments[offset + 1] === 'create'
  ) {
    return withHost(hostId, { kind: 'workspaces-create' });
  }

  if (
    segments.length === offset + 3 &&
    segments[offset] === 'workspaces' &&
    segments[offset + 2] === 'vscode'
  ) {
    return withHost(hostId, {
      kind: 'workspace-vscode',
      workspaceId: segments[offset + 1],
    });
  }

  if (segments.length === offset + 2 && segments[offset] === 'workspaces') {
    return withHost(hostId, {
      kind: 'workspace',
      workspaceId: segments[offset + 1],
    });
  }

  if (segments[offset] !== 'projects' || !segments[offset + 1]) {
    return null;
  }

  const projectId = segments[offset + 1];

  if (segments.length === offset + 2) {
    return withHost(hostId, { kind: 'project', projectId });
  }

  if (segments[offset + 2] === 'issues' && segments[offset + 3] === 'new') {
    return withHost(hostId, {
      kind: 'project-issue-create',
      projectId,
    });
  }

  if (
    segments[offset + 2] === 'issues' &&
    segments[offset + 3] &&
    segments[offset + 4] === 'workspaces' &&
    segments[offset + 5] === 'create' &&
    segments[offset + 6]
  ) {
    return withHost(hostId, {
      kind: 'project-issue-workspace-create',
      projectId,
      issueId: segments[offset + 3],
      draftId: segments[offset + 6],
    });
  }

  if (
    segments[offset + 2] === 'issues' &&
    segments[offset + 3] &&
    segments[offset + 4] === 'workspaces' &&
    segments[offset + 5]
  ) {
    return withHost(hostId, {
      kind: 'project-issue-workspace',
      projectId,
      issueId: segments[offset + 3],
      workspaceId: segments[offset + 5],
    });
  }

  if (segments[offset + 2] === 'issues' && segments[offset + 3]) {
    return withHost(hostId, {
      kind: 'project-issue',
      projectId,
      issueId: segments[offset + 3],
    });
  }

  if (
    segments[offset + 2] === 'workspaces' &&
    segments[offset + 3] === 'create' &&
    segments[offset + 4]
  ) {
    return withHost(hostId, {
      kind: 'project-workspace-create',
      projectId,
      draftId: segments[offset + 4],
    });
  }

  return null;
}
