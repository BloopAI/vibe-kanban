import { createContext, useContext } from 'react';

export const WorkspaceContext = createContext<string | undefined>(undefined);
export const SessionContext = createContext<string | undefined>(undefined);

export function useWorkspaceId() {
  return useContext(WorkspaceContext);
}

export function useSessionId() {
  return useContext(SessionContext);
}

// Local images metadata for rendering uploaded images before they're saved
export type LocalImageMetadata = {
  path: string; // ".vibe-images/uuid.png"
  proxy_url: string; // "/api/images/{id}/file"
  file_name: string;
  size_bytes: number;
  format: string;
};

export const LocalImagesContext = createContext<LocalImageMetadata[]>([]);

export function useLocalImages() {
  return useContext(LocalImagesContext);
}
