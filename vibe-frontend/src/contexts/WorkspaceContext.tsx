import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { useUser } from '@clerk/clerk-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantWorkspacesApi } from '@/lib/api';
import type {
  TenantWorkspace,
  CreateTenantWorkspace,
  UpdateTenantWorkspace,
} from '@/types/workspace';

const CURRENT_WORKSPACE_KEY = 'vibe-kanban-current-workspace';
const WORKSPACES_QUERY_KEY = ['tenant-workspaces'];

interface WorkspaceContextValue {
  // Current workspace
  currentWorkspace: TenantWorkspace | null;
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (id: string | null) => void;

  // All workspaces
  workspaces: TenantWorkspace[];
  isLoading: boolean;
  error: Error | null;

  // Mutations
  createWorkspace: (data: CreateTenantWorkspace) => Promise<TenantWorkspace>;
  updateWorkspace: (id: string, data: UpdateTenantWorkspace) => Promise<TenantWorkspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;

  // Refresh
  refetch: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const { user, isLoaded: isUserLoaded } = useUser();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const userEmail = user?.primaryEmailAddress?.emailAddress;

  // Get persisted workspace ID from localStorage
  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(CURRENT_WORKSPACE_KEY);
    }
    return null;
  });

  // Persist workspace ID to localStorage
  const setCurrentWorkspaceId = useCallback((id: string | null) => {
    setCurrentWorkspaceIdState(id);
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem(CURRENT_WORKSPACE_KEY, id);
      } else {
        localStorage.removeItem(CURRENT_WORKSPACE_KEY);
      }
    }
  }, []);

  // Fetch workspaces
  const {
    data: workspaces = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...WORKSPACES_QUERY_KEY, userId],
    queryFn: () => {
      if (!userId) throw new Error('User not authenticated');
      return tenantWorkspacesApi.list(userId);
    },
    enabled: isUserLoaded && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Auto-select first workspace if none selected
  useEffect(() => {
    if (!isLoading && workspaces.length > 0 && !currentWorkspaceId) {
      setCurrentWorkspaceId(workspaces[0].id);
    }
    // If current workspace doesn't exist anymore, clear it
    if (!isLoading && currentWorkspaceId && workspaces.length > 0) {
      const exists = workspaces.some(w => w.id === currentWorkspaceId);
      if (!exists) {
        setCurrentWorkspaceId(workspaces[0]?.id || null);
      }
    }
  }, [workspaces, currentWorkspaceId, isLoading, setCurrentWorkspaceId]);

  // Get current workspace
  const currentWorkspace = useMemo(() => {
    if (!currentWorkspaceId) return null;
    return workspaces.find(w => w.id === currentWorkspaceId) || null;
  }, [workspaces, currentWorkspaceId]);

  // Create workspace mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateTenantWorkspace) => {
      if (!userId || !userEmail) throw new Error('User not authenticated');
      return tenantWorkspacesApi.create(data, userId, userEmail);
    },
    onSuccess: (newWorkspace) => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
      // Auto-switch to new workspace
      setCurrentWorkspaceId(newWorkspace.id);
    },
  });

  // Update workspace mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTenantWorkspace }) => {
      if (!userId) throw new Error('User not authenticated');
      return tenantWorkspacesApi.update(id, data, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    },
  });

  // Delete workspace mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!userId) throw new Error('User not authenticated');
      return tenantWorkspacesApi.delete(id, userId);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
      // If deleted workspace was current, switch to another
      if (currentWorkspaceId === deletedId) {
        const remaining = workspaces.filter(w => w.id !== deletedId);
        setCurrentWorkspaceId(remaining[0]?.id || null);
      }
    },
  });

  // Wrapped mutation functions
  const createWorkspace = useCallback(
    (data: CreateTenantWorkspace) => createMutation.mutateAsync(data),
    [createMutation]
  );

  const updateWorkspace = useCallback(
    (id: string, data: UpdateTenantWorkspace) => updateMutation.mutateAsync({ id, data }),
    [updateMutation]
  );

  const deleteWorkspace = useCallback(
    (id: string) => deleteMutation.mutateAsync(id),
    [deleteMutation]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      currentWorkspace,
      currentWorkspaceId,
      setCurrentWorkspaceId,
      workspaces,
      isLoading,
      error: error as Error | null,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      isCreating: createMutation.isPending,
      isUpdating: updateMutation.isPending,
      isDeleting: deleteMutation.isPending,
      refetch,
    }),
    [
      currentWorkspace,
      currentWorkspaceId,
      setCurrentWorkspaceId,
      workspaces,
      isLoading,
      error,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      createMutation.isPending,
      updateMutation.isPending,
      deleteMutation.isPending,
      refetch,
    ]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

// Optional hook - returns null if outside provider (for use in optional contexts)
export function useWorkspaceOptional(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
