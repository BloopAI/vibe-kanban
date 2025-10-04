import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface NavigateOptions {
  attemptId?: string;
  fullscreen?: boolean;
  replace?: boolean;
  state?: unknown;
}

/**
 * Centralised hook for task routing and fullscreen controls
 * Exposes navigation helpers alongside fullscreen state/toggles
 */
export function useTaskViewManager() {
  const navigate = useNavigate();
  const location = useLocation();

  const isFullscreen = location.pathname.endsWith('/full');

  const toggleFullscreen = useCallback(
    (fullscreen: boolean) => {
      const currentPath = location.pathname;
      let targetPath: string;

      if (fullscreen) {
        targetPath = currentPath.endsWith('/full')
          ? currentPath
          : `${currentPath}/full`;
      } else {
        targetPath = currentPath.endsWith('/full')
          ? currentPath.slice(0, -5)
          : currentPath;
      }

      navigate(targetPath);
    },
    [location.pathname, navigate]
  );

  const buildTaskUrl = useCallback(
    (projectId: string, taskId: string, options?: NavigateOptions) => {
      const baseUrl = `/projects/${projectId}/tasks/${taskId}`;
      const attemptUrl = options?.attemptId
        ? `/attempts/${options.attemptId}`
        : '';
      const fullscreenSuffix =
        (options?.fullscreen ?? isFullscreen) ? '/full' : '';

      return `${baseUrl}${attemptUrl}${fullscreenSuffix}`;
    },
    [isFullscreen]
  );

  const navigateToTask = useCallback(
    (projectId: string, taskId: string, options?: NavigateOptions) => {
      const targetUrl = buildTaskUrl(projectId, taskId, options);

      navigate(targetUrl, {
        replace: options?.replace ?? true,
        state: options?.state,
      });
    },
    [buildTaskUrl, navigate]
  );

  const navigateToAttempt = useCallback(
    (
      projectId: string,
      taskId: string,
      attemptId: string,
      options?: Omit<NavigateOptions, 'attemptId'>
    ) => {
      navigateToTask(projectId, taskId, {
        ...options,
        attemptId,
      });
    },
    [navigateToTask]
  );

  const navigateToLatestAttempt = useCallback(
    (
      projectId: string,
      taskId: string,
      options?: Omit<NavigateOptions, 'attemptId'>
    ) => {
      navigateToAttempt(projectId, taskId, 'latest', options);
    },
    [navigateToAttempt]
  );

  const navigateToTasksList = useCallback(
    (
      projectId: string,
      options?: Pick<NavigateOptions, 'replace' | 'state'>
    ) => {
      navigate(`/projects/${projectId}/tasks`, {
        replace: options?.replace ?? false,
        state: options?.state,
      });
    },
    [navigate]
  );

  return {
    isFullscreen,
    toggleFullscreen,
    buildTaskUrl,
    navigateToTask,
    navigateToAttempt,
    navigateToLatestAttempt,
    navigateToTasksList,
  };
}
