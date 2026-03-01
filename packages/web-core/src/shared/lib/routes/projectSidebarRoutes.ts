import type { AppDestination } from '@/shared/lib/routes/appNavigation';

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

export function parseProjectSidebarDestination(
  destination: AppDestination | null
): ProjectSidebarRouteState | null {
  if (!destination) {
    return null;
  }

  switch (destination.kind) {
    case 'project':
      return {
        type: 'closed',
        hostId: destination.hostId ?? null,
        projectId: destination.projectId,
      };
    case 'project-issue-create':
      return {
        type: 'issue-create',
        hostId: destination.hostId ?? null,
        projectId: destination.projectId,
      };
    case 'project-issue':
      return {
        type: 'issue',
        hostId: destination.hostId ?? null,
        projectId: destination.projectId,
        issueId: destination.issueId,
      };
    case 'project-issue-workspace':
      return {
        type: 'issue-workspace',
        hostId: destination.hostId ?? null,
        projectId: destination.projectId,
        issueId: destination.issueId,
        workspaceId: destination.workspaceId,
      };
    case 'project-issue-workspace-create':
      return {
        type: 'workspace-create',
        hostId: destination.hostId ?? null,
        projectId: destination.projectId,
        issueId: destination.issueId,
        draftId: destination.draftId,
      };
    case 'project-workspace-create':
      return {
        type: 'workspace-create',
        hostId: destination.hostId ?? null,
        projectId: destination.projectId,
        issueId: null,
        draftId: destination.draftId,
      };
    default:
      return null;
  }
}

export function parseProjectSidebarRoute(
  pathname: string,
  resolveFromPath: (path: string) => AppDestination | null
): ProjectSidebarRouteState | null {
  return parseProjectSidebarDestination(resolveFromPath(pathname));
}
