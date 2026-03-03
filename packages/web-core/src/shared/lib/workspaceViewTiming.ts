type WorkspaceViewTimingWindow = Window &
  typeof globalThis & {
    __vkWorkspaceRouteEnteredAtMs?: Record<string, number>;
    __vkWorkspaceDataReadyAtMs?: Record<string, number>;
    __vkWorkspaceSessionsReadyAtMs?: Record<string, number>;
    __vkHistoryInitialLoadStartAtMs?: Record<string, number>;
    __vkHistoryInitialLoadDoneAtMs?: Record<string, number>;
    __vkHistoryRemainingBatchesDoneAtMs?: Record<string, number>;
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
  if (timingWindow.__vkHistoryInitialLoadStartAtMs) {
    delete timingWindow.__vkHistoryInitialLoadStartAtMs[workspaceId];
  }
  if (timingWindow.__vkHistoryInitialLoadDoneAtMs) {
    delete timingWindow.__vkHistoryInitialLoadDoneAtMs[workspaceId];
  }
  if (timingWindow.__vkHistoryRemainingBatchesDoneAtMs) {
    delete timingWindow.__vkHistoryRemainingBatchesDoneAtMs[workspaceId];
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

export const markHistoryInitialLoadStart = (
  attemptId: string | undefined | null
): void => {
  if (!attemptId) return;

  const timingWindow = getTimingWindow();
  if (!timingWindow) return;

  timingWindow.__vkHistoryInitialLoadStartAtMs ??= {};
  if (timingWindow.__vkHistoryInitialLoadStartAtMs[attemptId] != null) return;

  timingWindow.__vkHistoryInitialLoadStartAtMs[attemptId] = performance.now();
};

export const getHistoryInitialLoadStartAt = (
  attemptId: string | undefined | null
): number | undefined => {
  if (!attemptId) return undefined;

  const timingWindow = getTimingWindow();
  return timingWindow?.__vkHistoryInitialLoadStartAtMs?.[attemptId];
};

export const markHistoryInitialLoadDone = (
  attemptId: string | undefined | null
): void => {
  if (!attemptId) return;

  const timingWindow = getTimingWindow();
  if (!timingWindow) return;

  timingWindow.__vkHistoryInitialLoadDoneAtMs ??= {};
  if (timingWindow.__vkHistoryInitialLoadDoneAtMs[attemptId] != null) return;

  timingWindow.__vkHistoryInitialLoadDoneAtMs[attemptId] = performance.now();
};

export const getHistoryInitialLoadDoneAt = (
  attemptId: string | undefined | null
): number | undefined => {
  if (!attemptId) return undefined;

  const timingWindow = getTimingWindow();
  return timingWindow?.__vkHistoryInitialLoadDoneAtMs?.[attemptId];
};

export const markHistoryRemainingBatchesDone = (
  attemptId: string | undefined | null
): void => {
  if (!attemptId) return;

  const timingWindow = getTimingWindow();
  if (!timingWindow) return;

  timingWindow.__vkHistoryRemainingBatchesDoneAtMs ??= {};
  if (timingWindow.__vkHistoryRemainingBatchesDoneAtMs[attemptId] != null)
    return;

  timingWindow.__vkHistoryRemainingBatchesDoneAtMs[attemptId] =
    performance.now();
};

export const getHistoryRemainingBatchesDoneAt = (
  attemptId: string | undefined | null
): number | undefined => {
  if (!attemptId) return undefined;

  const timingWindow = getTimingWindow();
  return timingWindow?.__vkHistoryRemainingBatchesDoneAtMs?.[attemptId];
};
