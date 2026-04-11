export const paths = {
  projects: () => '/workspaces',
  projectTasks: (projectId: string) => `/projects/${projectId}`,
  task: (projectId: string, taskId: string) => {
    void taskId;
    return `/projects/${projectId}`;
  },
  attempt: (projectId: string, taskId: string, workspaceId: string) => {
    void taskId;
    void workspaceId;
    return `/projects/${projectId}`;
  },
  attemptFull: (projectId: string, taskId: string, workspaceId: string) => {
    void taskId;
    void workspaceId;
    return `/projects/${projectId}`;
  },
};
