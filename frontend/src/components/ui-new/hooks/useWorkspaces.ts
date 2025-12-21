import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { Workspace as ApiWorkspace } from 'shared/types';

// UI-specific workspace type for sidebar display
export interface SidebarWorkspace {
  id: string;
  name: string;
  description: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isRunning?: boolean;
  isPinned?: boolean;
}

// Keep the old export name for backwards compatibility
export type Workspace = SidebarWorkspace;

export interface UseWorkspacesResult {
  workspaces: SidebarWorkspace[];
  isLoading: boolean;
}

// Simple hash function to generate consistent pseudo-random values from ID
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Transform API Workspace to SidebarWorkspace with mock display fields
function toSidebarWorkspace(
  apiWorkspace: ApiWorkspace,
  index: number
): SidebarWorkspace {
  const hash = simpleHash(apiWorkspace.id);

  return {
    id: apiWorkspace.id,
    name: apiWorkspace.branch, // Use branch as name for now
    description: '',
    // Generate varied mock stats based on workspace id hash
    filesChanged: (hash % 12) + 1, // 1-12 files
    linesAdded: (hash % 500) + 10, // 10-509 lines
    linesRemoved: hash % 200, // 0-199 lines
    isRunning: index === 0, // First workspace is "running"
    isPinned: hash % 5 === 0, // ~20% are pinned
  };
}

export const workspaceKeys = {
  all: ['workspaces'] as const,
};

export function useWorkspaces(): UseWorkspacesResult {
  const { data, isLoading } = useQuery<ApiWorkspace[]>({
    queryKey: workspaceKeys.all,
    queryFn: () => attemptsApi.getAllWorkspaces(),
  });

  const workspaces: SidebarWorkspace[] =
    data?.map((w, i) => toSidebarWorkspace(w, i)) ?? [];

  return {
    workspaces,
    isLoading,
  };
}
