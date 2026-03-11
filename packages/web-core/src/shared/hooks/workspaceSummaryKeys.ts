export const workspaceSummaryKeys = {
  all: ['workspace-summaries'] as const,
  byArchived: (archived: boolean, hostId: string | null = null) =>
    [
      'workspace-summaries',
      hostId ?? 'local',
      archived ? 'archived' : 'active',
    ] as const,
};
