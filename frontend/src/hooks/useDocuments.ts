import { useState, useEffect, useCallback } from 'react';
import { documentsApi } from '@/lib/api';
import type {
  Document,
  DocumentFolder,
  CreateDocument,
  UpdateDocument,
  CreateDocumentFolder,
  UpdateDocumentFolder,
} from 'shared/types';

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
}

export function useDocuments(teamId: string): UseDocumentsResult {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!teamId) return;

    try {
      setIsLoading(true);
      setError(null);

      const [docsData, foldersData] = await Promise.all([
        documentsApi.list(teamId, { folderId: currentFolderId ?? undefined }),
        documentsApi.listFolders(teamId),
      ]);

      setDocuments(docsData);
      setFolders(foldersData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch documents'));
    } finally {
      setIsLoading(false);
    }
  }, [teamId, currentFolderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Document operations
  const createDocument = useCallback(
    async (data: Omit<CreateDocument, 'team_id'>) => {
      const newDoc = await documentsApi.create(teamId, {
        ...data,
        team_id: teamId,
        folder_id: data.folder_id ?? currentFolderId,
      });
      setDocuments((prev) => [...prev, newDoc]);
      return newDoc;
    },
    [teamId, currentFolderId]
  );

  const updateDocument = useCallback(
    async (documentId: string, data: UpdateDocument) => {
      const updatedDoc = await documentsApi.update(teamId, documentId, data);
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === documentId ? updatedDoc : doc))
      );
      return updatedDoc;
    },
    [teamId]
  );

  const deleteDocument = useCallback(
    async (documentId: string) => {
      await documentsApi.delete(teamId, documentId);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
    },
    [teamId]
  );

  // Folder operations
  const createFolder = useCallback(
    async (data: Omit<CreateDocumentFolder, 'team_id'>) => {
      const newFolder = await documentsApi.createFolder(teamId, {
        ...data,
        team_id: teamId,
        parent_id: data.parent_id ?? currentFolderId,
      });
      setFolders((prev) => [...prev, newFolder]);
      return newFolder;
    },
    [teamId, currentFolderId]
  );

  const updateFolder = useCallback(
    async (folderId: string, data: UpdateDocumentFolder) => {
      const updatedFolder = await documentsApi.updateFolder(teamId, folderId, data);
      setFolders((prev) =>
        prev.map((folder) => (folder.id === folderId ? updatedFolder : folder))
      );
      return updatedFolder;
    },
    [teamId]
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      await documentsApi.deleteFolder(teamId, folderId);
      setFolders((prev) => prev.filter((folder) => folder.id !== folderId));
    },
    [teamId]
  );

  // Search
  const searchDocuments = useCallback(
    async (query: string) => {
      const results = await documentsApi.list(teamId, { search: query });
      return results;
    },
    [teamId]
  );

  return {
    documents,
    folders,
    isLoading,
    error,
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
  };
}
