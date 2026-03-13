import { createContext, useContext } from 'react';

export const WorkspaceContext = createContext<string | undefined>(undefined);
export const SessionContext = createContext<string | undefined>(undefined);

export function useWorkspaceId() {
  return useContext(WorkspaceContext);
}

export function useSessionId() {
  return useContext(SessionContext);
}

// Local file metadata for rendering uploaded files before they're saved
export type LocalFileMetadata = {
  path: string; // ".vibe-images/uuid.png"
  proxy_url: string; // "/api/images/{id}/file"
  file_name: string;
  size_bytes: number;
  format: string;
  mime_type: string;
  is_pending?: boolean;
  pending_status?: 'hashing' | 'uploading' | 'confirming';
  upload_progress?: number;
};

export const LocalFilesContext = createContext<LocalFileMetadata[]>([]);

export function useLocalFiles() {
  return useContext(LocalFilesContext);
}
