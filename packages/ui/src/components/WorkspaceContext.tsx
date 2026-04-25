import { createContext, useContext } from 'react';

export const WorkspaceContext = createContext<string | undefined>(undefined);
export const SessionContext = createContext<string | undefined>(undefined);
export const HostIdContext = createContext<string | null>(null);

export function useWorkspaceId() {
  return useContext(WorkspaceContext);
}

export function useSessionId() {
  return useContext(SessionContext);
}

export function useHostId() {
  return useContext(HostIdContext);
}

export function scopeLocalApiPath(
  pathOrUrl: string,
  hostId: string | null | undefined
) {
  if (!hostId) return pathOrUrl;
  if (!pathOrUrl.startsWith('/api/') || pathOrUrl.startsWith('/api/host/')) {
    return pathOrUrl;
  }

  return `/api/host/${hostId}${pathOrUrl.slice('/api'.length)}`;
}

// Local attachment metadata for rendering uploaded attachments before they're saved
export type LocalAttachmentMetadata = {
  path: string; // ".vibe-attachments/uuid.png"
  proxy_url: string; // "/api/attachments/{id}/file"
  file_name: string;
  size_bytes: number;
  format: string;
  mime_type: string;
  is_pending?: boolean;
  pending_status?: 'hashing' | 'uploading' | 'confirming';
  upload_progress?: number;
};

export const LocalAttachmentsContext = createContext<LocalAttachmentMetadata[]>(
  []
);

export function useLocalAttachments() {
  return useContext(LocalAttachmentsContext);
}
