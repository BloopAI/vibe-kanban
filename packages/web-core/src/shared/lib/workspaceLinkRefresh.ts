export const WORKSPACE_LINK_REFRESH_EVENT = 'vk:workspace-link-refresh';

export interface WorkspaceLinkRefreshDetail {
  projectId?: string | null;
}

export function dispatchWorkspaceLinkRefresh(
  detail: WorkspaceLinkRefreshDetail
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<WorkspaceLinkRefreshDetail>(WORKSPACE_LINK_REFRESH_EVENT, {
      detail,
    })
  );
}
