export interface Workspace {
  id: string;
  name: string;
  description: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isRunning?: boolean;
  isPinned?: boolean;
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
      name: 'add icon to variant selection',
      description: 'Main development workspace',
      filesChanged: 3,
      linesAdded: 13,
    },
    {
      id: '2',
      name: 'Inject ENV vars into shell',
      description: 'Experimental features',
      filesChanged: 3,
      linesAdded: 300,
      linesRemoved: 136,
      isRunning: true,
    },
    {
      id: '3',
      name: 'Documentation updates',
      description: 'Docs and guides',
      filesChanged: 1,
      linesAdded: 45,
      isPinned: true,
    },
    {
      id: '4',
      name: 'Feature branch work',
      description: 'New feature',
      filesChanged: 5,
      linesAdded: 200,
      linesRemoved: 50,
      isRunning: false,
      isPinned: false,
    },
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
