import { useQuery } from '@tanstack/react-query';
import { fileBrowserApi } from '@/lib/api';
import type { DirectoryListResponse, FileContentResponse } from 'shared/types';
import type { FileSource } from '@/stores/useFileBrowserStore';

/**
 * Query key factory for file browser queries
 */
export const fileBrowserKeys = {
  all: ['fileBrowser'] as const,
  directory: (source: FileSource, id: string, path?: string | null) =>
    [...fileBrowserKeys.all, 'directory', source, id, path ?? ''] as const,
  file: (source: FileSource, id: string, filePath: string) =>
    [...fileBrowserKeys.all, 'file', source, id, filePath] as const,
};

/**
 * Hook to fetch directory listing for either worktree or main project
 */
export function useDirectoryListing(
  source: FileSource,
  id: string | null | undefined,
  path?: string | null,
  enabled = true
) {
  return useQuery<DirectoryListResponse>({
    queryKey: fileBrowserKeys.directory(source, id ?? '', path),
    queryFn: async () => {
      if (!id) throw new Error('ID is required');

      if (source === 'worktree') {
        return fileBrowserApi.listWorktreeDirectory(id, path ?? undefined);
      } else {
        return fileBrowserApi.listProjectDirectory(id, path ?? undefined);
      }
    },
    enabled: enabled && !!id,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}

/**
 * Hook to fetch file content for either worktree or main project
 */
export function useFileContent(
  source: FileSource,
  id: string | null | undefined,
  filePath: string | null | undefined,
  enabled = true
) {
  return useQuery<FileContentResponse>({
    queryKey: fileBrowserKeys.file(source, id ?? '', filePath ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('ID is required');
      if (!filePath) throw new Error('File path is required');

      if (source === 'worktree') {
        return fileBrowserApi.readWorktreeFile(id, filePath);
      } else {
        return fileBrowserApi.readProjectFile(id, filePath);
      }
    },
    enabled: enabled && !!id && !!filePath,
    staleTime: 60000, // File content fresh for 1 minute
  });
}

/**
 * Helper to determine if a file is markdown based on extension
 */
export function isMarkdownFile(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx');
}

/**
 * Helper to get language from file response
 */
export function getFileLanguage(
  response: FileContentResponse | undefined
): string {
  return response?.language ?? 'plaintext';
}
