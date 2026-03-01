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
