import type { IssuePriority } from 'shared/remote-types';

export type AppDestination =
  | { kind: 'root' }
  | { kind: 'onboarding' }
  | { kind: 'onboarding-sign-in' }
  | { kind: 'migrate' }
  | { kind: 'workspaces'; hostId?: string }
  | { kind: 'workspaces-create'; hostId?: string }
  | { kind: 'workspace'; workspaceId: string; hostId?: string }
  | { kind: 'workspace-vscode'; workspaceId: string; hostId?: string }
  | { kind: 'project'; projectId: string; hostId?: string }
  | { kind: 'project-issue-create'; projectId: string; hostId?: string }
  | {
      kind: 'project-issue';
      projectId: string;
      issueId: string;
      hostId?: string;
    }
  | {
      kind: 'project-issue-workspace';
      projectId: string;
      issueId: string;
      workspaceId: string;
      hostId?: string;
    }
  | {
      kind: 'project-issue-workspace-create';
      projectId: string;
      issueId: string;
      draftId: string;
      hostId?: string;
    }
  | {
      kind: 'project-workspace-create';
      projectId: string;
      draftId: string;
      hostId?: string;
    };

export type NavigationTransition = {
  replace?: boolean;
};

export interface AppNavigation {
  resolveFromPath(path: string): AppDestination | null;
  goToRoot(transition?: NavigationTransition): void;
  goToOnboarding(transition?: NavigationTransition): void;
  goToOnboardingSignIn(transition?: NavigationTransition): void;
  goToMigrate(transition?: NavigationTransition): void;
  goToWorkspaces(transition?: NavigationTransition): void;
  goToWorkspacesCreate(transition?: NavigationTransition): void;
  goToWorkspace(workspaceId: string, transition?: NavigationTransition): void;
  goToWorkspaceVsCode(
    workspaceId: string,
    transition?: NavigationTransition
  ): void;
  goToProject(projectId: string, transition?: NavigationTransition): void;
  goToProjectIssueCreate(
    projectId: string,
    transition?: NavigationTransition
  ): void;
  goToProjectIssue(
    projectId: string,
    issueId: string,
    transition?: NavigationTransition
  ): void;
  goToProjectIssueWorkspace(
    projectId: string,
    issueId: string,
    workspaceId: string,
    transition?: NavigationTransition
  ): void;
  goToProjectIssueWorkspaceCreate(
    projectId: string,
    issueId: string,
    draftId: string,
    transition?: NavigationTransition
  ): void;
  goToProjectWorkspaceCreate(
    projectId: string,
    draftId: string,
    transition?: NavigationTransition
  ): void;
}

export interface ProjectIssueCreateOptions {
  statusId?: string;
  priority?: IssuePriority;
  assigneeIds?: string[];
  parentIssueId?: string;
}

export function getDestinationHostId(
  destination: AppDestination | null
): string | null {
  if (!destination || !('hostId' in destination)) {
    return null;
  }

  return destination.hostId ?? null;
}

export function isProjectDestination(
  destination: AppDestination | null
): boolean {
  if (!destination) {
    return false;
  }

  switch (destination.kind) {
    case 'project':
    case 'project-issue-create':
    case 'project-issue':
    case 'project-issue-workspace':
    case 'project-issue-workspace-create':
    case 'project-workspace-create':
      return true;
    default:
      return false;
  }
}

export function isWorkspacesDestination(
  destination: AppDestination | null
): boolean {
  if (!destination) {
    return false;
  }

  switch (destination.kind) {
    case 'workspaces':
    case 'workspaces-create':
    case 'workspace':
    case 'workspace-vscode':
      return true;
    default:
      return false;
  }
}

export function goToAppDestination(
  appNavigation: AppNavigation,
  destination: AppDestination,
  transition?: NavigationTransition
): void {
  switch (destination.kind) {
    case 'root':
      appNavigation.goToRoot(transition);
      return;
    case 'onboarding':
      appNavigation.goToOnboarding(transition);
      return;
    case 'onboarding-sign-in':
      appNavigation.goToOnboardingSignIn(transition);
      return;
    case 'migrate':
      appNavigation.goToMigrate(transition);
      return;
    case 'workspaces':
      appNavigation.goToWorkspaces(transition);
      return;
    case 'workspaces-create':
      appNavigation.goToWorkspacesCreate(transition);
      return;
    case 'workspace':
      appNavigation.goToWorkspace(destination.workspaceId, transition);
      return;
    case 'workspace-vscode':
      appNavigation.goToWorkspaceVsCode(destination.workspaceId, transition);
      return;
    case 'project':
      appNavigation.goToProject(destination.projectId, transition);
      return;
    case 'project-issue-create':
      appNavigation.goToProjectIssueCreate(destination.projectId, transition);
      return;
    case 'project-issue':
      appNavigation.goToProjectIssue(
        destination.projectId,
        destination.issueId,
        transition
      );
      return;
    case 'project-issue-workspace':
      appNavigation.goToProjectIssueWorkspace(
        destination.projectId,
        destination.issueId,
        destination.workspaceId,
        transition
      );
      return;
    case 'project-issue-workspace-create':
      appNavigation.goToProjectIssueWorkspaceCreate(
        destination.projectId,
        destination.issueId,
        destination.draftId,
        transition
      );
      return;
    case 'project-workspace-create':
      appNavigation.goToProjectWorkspaceCreate(
        destination.projectId,
        destination.draftId,
        transition
      );
      return;
  }
}
