import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useCallback,
} from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { nodesApi } from '@/lib/api';
import type { Node, NodeProject } from '@/types/nodes';

interface NodesContextValue {
  nodes: Node[];
  isLoading: boolean;
  error: Error | null;
  isError: boolean;
  refetch: () => void;
  deleteNode: (nodeId: string) => Promise<void>;
  isDeletingNode: boolean;
  getNodeProjects: (nodeId: string) => Promise<NodeProject[]>;
}

const NodesContext = createContext<NodesContextValue | null>(null);

interface NodesProviderProps {
  children: ReactNode;
  organizationId: string | undefined;
}

export function NodesProvider({ children, organizationId }: NodesProviderProps) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['nodes', organizationId],
    queryFn: () => nodesApi.list(organizationId!),
    enabled: !!organizationId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Refresh every 30 seconds to get status updates
  });

  const deleteMutation = useMutation({
    mutationFn: nodesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes', organizationId] });
    },
  });

  const deleteNode = useCallback(
    async (nodeId: string) => {
      await deleteMutation.mutateAsync(nodeId);
    },
    [deleteMutation]
  );

  const getNodeProjects = useCallback(async (nodeId: string) => {
    return nodesApi.listProjects(nodeId);
  }, []);

  const refetch = useCallback(() => {
    query.refetch();
  }, [query]);

  const value = useMemo(
    () => ({
      nodes: query.data ?? [],
      isLoading: query.isLoading,
      error: query.error,
      isError: query.isError,
      refetch,
      deleteNode,
      isDeletingNode: deleteMutation.isPending,
      getNodeProjects,
    }),
    [
      query.data,
      query.isLoading,
      query.error,
      query.isError,
      refetch,
      deleteNode,
      deleteMutation.isPending,
      getNodeProjects,
    ]
  );

  return (
    <NodesContext.Provider value={value}>{children}</NodesContext.Provider>
  );
}

export function useNodes(): NodesContextValue {
  const context = useContext(NodesContext);
  if (!context) {
    throw new Error('useNodes must be used within a NodesProvider');
  }
  return context;
}
