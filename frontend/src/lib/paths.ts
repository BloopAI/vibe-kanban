export const paths = {
  projects: () => '/projects',
  projectTasks: (projectId: string) => `/projects/${projectId}/tasks`,
  task: (projectId: string, taskId: string) =>
    `/projects/${projectId}/tasks/${taskId}`,
  attempt: (projectId: string, taskId: string, attemptId: string) =>
    `/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}`,
  taskFull: (projectId: string, taskId: string) =>
    `/projects/${projectId}/tasks/${taskId}/full`,
  attemptFullTab: (
    projectId: string,
    taskId: string,
    attemptId: string,
    tab: 'preview' | 'diffs' = 'preview'
  ) =>
    `/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/full/${tab}`,
};
