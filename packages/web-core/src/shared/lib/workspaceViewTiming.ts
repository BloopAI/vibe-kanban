type WorkspaceViewTimingWindow = Window &
  typeof globalThis & {
    __vkWorkspaceRouteEnteredAtMs?: Record<string, number>;
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
};

export const getWorkspaceViewEnteredAt = (
  workspaceId: string | undefined | null
): number | undefined => {
  if (!workspaceId) return undefined;

  const timingWindow = getTimingWindow();
  return timingWindow?.__vkWorkspaceRouteEnteredAtMs?.[workspaceId];
};
