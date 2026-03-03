type WorkspaceViewTimingWindow = Window &
  typeof globalThis & {
    __vkWorkspaceRouteEnteredAtMs?: Record<string, number>;
    __vkWorkspaceDataReadyAtMs?: Record<string, number>;
    __vkWorkspaceSessionsReadyAtMs?: Record<string, number>;
  };

const getTimingWindow = (): WorkspaceViewTimingWindow | null => {
  if (typeof window === 'undefined') return null;
  return window as WorkspaceViewTimingWindow;
};

export const markWorkspaceViewEntered = (
  workspaceId: string | undefined | null
): void => {
  if (!workspaceId) return;

  const timingWindow = getTimingWindow();
  if (!timingWindow) return;

  timingWindow.__vkWorkspaceRouteEnteredAtMs ??= {};
  timingWindow.__vkWorkspaceRouteEnteredAtMs[workspaceId] = performance.now();

  // Reset per-navigation readiness milestones for this workspace.
  if (timingWindow.__vkWorkspaceDataReadyAtMs) {
    delete timingWindow.__vkWorkspaceDataReadyAtMs[workspaceId];
  }
  if (timingWindow.__vkWorkspaceSessionsReadyAtMs) {
    delete timingWindow.__vkWorkspaceSessionsReadyAtMs[workspaceId];
  }
};

export const getWorkspaceViewEnteredAt = (
  workspaceId: string | undefined | null
): number | undefined => {
  if (!workspaceId) return undefined;

  const timingWindow = getTimingWindow();
  return timingWindow?.__vkWorkspaceRouteEnteredAtMs?.[workspaceId];
};

export const markWorkspaceDataReady = (
  workspaceId: string | undefined | null
): void => {
  if (!workspaceId) return;

  const timingWindow = getTimingWindow();
  if (!timingWindow) return;

  timingWindow.__vkWorkspaceDataReadyAtMs ??= {};
  if (timingWindow.__vkWorkspaceDataReadyAtMs[workspaceId] != null) return;

  timingWindow.__vkWorkspaceDataReadyAtMs[workspaceId] = performance.now();
};

export const getWorkspaceDataReadyAt = (
  workspaceId: string | undefined | null
): number | undefined => {
  if (!workspaceId) return undefined;

  const timingWindow = getTimingWindow();
  return timingWindow?.__vkWorkspaceDataReadyAtMs?.[workspaceId];
};

export const markWorkspaceSessionsReady = (
  workspaceId: string | undefined | null
): void => {
  if (!workspaceId) return;

  const timingWindow = getTimingWindow();
  if (!timingWindow) return;

  timingWindow.__vkWorkspaceSessionsReadyAtMs ??= {};
  if (timingWindow.__vkWorkspaceSessionsReadyAtMs[workspaceId] != null) return;

  timingWindow.__vkWorkspaceSessionsReadyAtMs[workspaceId] = performance.now();
};

export const getWorkspaceSessionsReadyAt = (
  workspaceId: string | undefined | null
): number | undefined => {
  if (!workspaceId) return undefined;

  const timingWindow = getTimingWindow();
  return timingWindow?.__vkWorkspaceSessionsReadyAtMs?.[workspaceId];
};
