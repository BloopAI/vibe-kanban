export const paths = {
  projects: () => '/local-projects',
  projectTasks: (projectId: string) => `/local-projects/${projectId}/tasks`,
  task: (projectId: string, taskId: string) =>
    `/local-projects/${projectId}/tasks/${taskId}`,
  attempt: (projectId: string, taskId: string, attemptId: string) =>
    `/local-projects/${projectId}/tasks/${taskId}/attempts/${attemptId}`,
  attemptFull: (projectId: string, taskId: string, attemptId: string) =>
    `/local-projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/full`,
};
