import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '@/lib/api';
import type {
  Document,
  DocumentFolder,
  CreateDocument,
  UpdateDocument,
  CreateDocumentFolder,
  UpdateDocumentFolder,
  ScanFilesystemResponse,
  ScanAllResponse,
  DiscoverFoldersResponse,
} from 'shared/types';

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || msg.includes('too many requests');
  }
  return false;
}

// Query keys for consistent caching
export const documentsKeys = {
  all: ['documents'] as const,
  team: (teamId: string) => [...documentsKeys.all, teamId] as const,
  list: (teamId: string, folderId: string | null) => [...documentsKeys.team(teamId), 'list', folderId] as const,
  folders: (teamId: string) => [...documentsKeys.team(teamId), 'folders'] as const,
};

export interface UseDocumentsResult {
  documents: Document[];
  folders: DocumentFolder[];
  isLoading: boolean;
  error: Error | null;
  currentFolderId: string | null;
  setCurrentFolderId: (folderId: string | null) => void;
  refresh: () => Promise<void>;
  // Document operations
  createDocument: (data: Omit<CreateDocument, 'team_id'>) => Promise<Document>;
  updateDocument: (documentId: string, data: UpdateDocument) => Promise<Document>;
  deleteDocument: (documentId: string) => Promise<void>;
  // Folder operations
  createFolder: (data: Omit<CreateDocumentFolder, 'team_id'>) => Promise<DocumentFolder>;
  updateFolder: (folderId: string, data: UpdateDocumentFolder) => Promise<DocumentFolder>;
  deleteFolder: (folderId: string) => Promise<void>;
  // Search
  searchDocuments: (query: string) => Promise<Document[]>;
  // Filesystem scan
  scanFilesystem: (folderId: string) => Promise<ScanFilesystemResponse>;
  // Recursive scan: create all nested folders and documents
  scanAll: () => Promise<ScanAllResponse>;
  // Discover folders from filesystem
  discoverFolders: () => Promise<DiscoverFoldersResponse>;
}

/**
 * Hook for managing documents with TanStack Query for request deduplication.
 */
export function useDocuments(teamId: string): UseDocumentsResult {
  const queryClient = useQueryClient();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Query for documents in current folder
  const {
    data: documents = [],
    isLoading: docsLoading,
    error: docsError,
  } = useQuery<Document[]>({
    queryKey: documentsKeys.list(teamId, currentFolderId),
    queryFn: () => documentsApi.list(teamId, { folderId: currentFolderId ?? undefined }),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000,
  });

  // Query for all folders
  const {
    data: folders = [],
    isLoading: foldersLoading,
  } = useQuery<DocumentFolder[]>({
    queryKey: documentsKeys.folders(teamId),
    queryFn: () => documentsApi.listFolders(teamId),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000,
  });

  const refresh = useCallback(async () => {
    if (!teamId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: documentsKeys.list(teamId, currentFolderId) }),
      queryClient.invalidateQueries({ queryKey: documentsKeys.folders(teamId) }),
    ]);
  }, [teamId, currentFolderId, queryClient]);

  // Document mutations
  // Note: team_id is extracted from the URL path by the backend middleware,
  // so we don't include it here (would fail if we sent slug instead of UUID)
  const createDocMutation = useMutation({
    mutationFn: (data: Omit<CreateDocument, 'team_id'>) =>
      documentsApi.create(teamId, {
        ...data,
        folder_id: data.folder_id ?? currentFolderId,
      }),
    onSuccess: (newDoc) => {
      queryClient.setQueryData<Document[]>(documentsKeys.list(teamId, currentFolderId), (old) =>
        old ? [...old, newDoc] : [newDoc]
      );
    },
  });

  const updateDocMutation = useMutation({
    mutationFn: ({ documentId, data }: { documentId: string; data: UpdateDocument }) =>
      documentsApi.update(teamId, documentId, data),
    onSuccess: (updatedDoc) => {
      queryClient.setQueryData<Document[]>(documentsKeys.list(teamId, currentFolderId), (old) =>
        old?.map((doc) => (doc.id === updatedDoc.id ? updatedDoc : doc)) ?? []
      );
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (documentId: string) => documentsApi.delete(teamId, documentId),
    onSuccess: (_, documentId) => {
      queryClient.setQueryData<Document[]>(documentsKeys.list(teamId, currentFolderId), (old) =>
        old?.filter((doc) => doc.id !== documentId) ?? []
      );
    },
  });

  // Folder mutations
  // Note: team_id is extracted from the URL path by the backend middleware,
  // so we don't include it here (would fail if we sent slug instead of UUID)
  const createFolderMutation = useMutation({
    mutationFn: (data: Omit<CreateDocumentFolder, 'team_id'>) =>
      documentsApi.createFolder(teamId, {
        ...data,
        parent_id: data.parent_id ?? currentFolderId,
      }),
    onSuccess: (newFolder) => {
      queryClient.setQueryData<DocumentFolder[]>(documentsKeys.folders(teamId), (old) =>
        old ? [...old, newFolder] : [newFolder]
      );
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: ({ folderId, data }: { folderId: string; data: UpdateDocumentFolder }) =>
      documentsApi.updateFolder(teamId, folderId, data),
    onSuccess: (updatedFolder) => {
      queryClient.setQueryData<DocumentFolder[]>(documentsKeys.folders(teamId), (old) =>
        old?.map((folder) => (folder.id === updatedFolder.id ? updatedFolder : folder)) ?? []
      );
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => documentsApi.deleteFolder(teamId, folderId),
    onSuccess: (_, folderId) => {
      queryClient.setQueryData<DocumentFolder[]>(documentsKeys.folders(teamId), (old) =>
        old?.filter((folder) => folder.id !== folderId) ?? []
      );
    },
  });

  // Callbacks
  const createDocument = useCallback(
    async (data: Omit<CreateDocument, 'team_id'>) => createDocMutation.mutateAsync(data),
    [createDocMutation]
  );

  const updateDocument = useCallback(
    async (documentId: string, data: UpdateDocument) =>
      updateDocMutation.mutateAsync({ documentId, data }),
    [updateDocMutation]
  );

  const deleteDocument = useCallback(
    async (documentId: string) => { await deleteDocMutation.mutateAsync(documentId); },
    [deleteDocMutation]
  );

  const createFolder = useCallback(
    async (data: Omit<CreateDocumentFolder, 'team_id'>) => createFolderMutation.mutateAsync(data),
    [createFolderMutation]
  );

  const updateFolder = useCallback(
    async (folderId: string, data: UpdateDocumentFolder) =>
      updateFolderMutation.mutateAsync({ folderId, data }),
    [updateFolderMutation]
  );

  const deleteFolder = useCallback(
    async (folderId: string) => { await deleteFolderMutation.mutateAsync(folderId); },
    [deleteFolderMutation]
  );

  // Search - doesn't need mutation, just a simple query
  const searchDocuments = useCallback(
    async (query: string) => documentsApi.list(teamId, { search: query }),
    [teamId]
  );

  // Scan operations - these trigger refresh after completion
  const scanFilesystem = useCallback(
    async (folderId: string) => {
      const result = await documentsApi.scanFilesystem(teamId, folderId);
      await refresh();
      return result;
    },
    [teamId, refresh]
  );

  const scanAll = useCallback(async () => {
    const result = await documentsApi.scanAll(teamId);
    await refresh();
    return result;
  }, [teamId, refresh]);

  const discoverFolders = useCallback(async () => {
    const result = await documentsApi.discoverFolders(teamId);
    await refresh();
    return result;
  }, [teamId, refresh]);

  return {
    documents,
    folders,
    isLoading: docsLoading || foldersLoading,
    error: docsError ? (docsError instanceof Error ? docsError : new Error('Failed to fetch documents')) : null,
    currentFolderId,
    setCurrentFolderId,
    refresh,
    createDocument,
    updateDocument,
    deleteDocument,
    createFolder,
    updateFolder,
    deleteFolder,
    searchDocuments,
    scanFilesystem,
    scanAll,
    discoverFolders,
  };
}
