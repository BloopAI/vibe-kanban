export interface Workspace {
  id: string;
  name: string;
  description: string;
}

export interface UseWorkspacesResult {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  selectWorkspace: (id: string) => void;
  isLoading: boolean;
}

export function useWorkspaces(): UseWorkspacesResult {
  // Placeholder mock data - will be replaced with actual API calls
  const workspaces: Workspace[] = [
    {
      id: '1',
      name: 'Project Alpha',
      description: 'Main development workspace',
    },
    { id: '2', name: 'Project Beta', description: 'Experimental features' },
    { id: '3', name: 'Documentation', description: 'Docs and guides' },
  ];

  // In a real implementation, this would use useState/useQuery
  const selectedWorkspaceId = '1';
  // Placeholder - will be implemented with actual state management
  const selectWorkspace = () => {};

  return {
    workspaces,
    selectedWorkspaceId,
    selectWorkspace,
    isLoading: false,
  };
}
