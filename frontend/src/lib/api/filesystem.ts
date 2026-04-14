/**
 * Filesystem API namespaces.
 */

import type {
  DirectoryListResponse,
  DirectoryEntry,
  FileContentResponse,
} from 'shared/types';
import { makeRequest, handleApiResponse } from './utils';

/**
 * File System API namespace for directory and git repository listing.
 */
export const fileSystemApi = {
  /**
   * List directory contents at the given path.
   * If no path is provided, lists the root directory.
   */
  list: async (path?: string): Promise<DirectoryListResponse> => {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await makeRequest(
      `/api/filesystem/directory${queryParam}`
    );
    return handleApiResponse<DirectoryListResponse>(response);
  },

  /**
   * List git repositories under the given path.
   * If no path is provided, searches from the root.
   */
  listGitRepos: async (path?: string): Promise<DirectoryEntry[]> => {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await makeRequest(
      `/api/filesystem/git-repos${queryParam}`
    );
    return handleApiResponse<DirectoryEntry[]>(response);
  },
};

/**
 * File Browser API namespace for browsing worktree and project files.
 */
export const fileBrowserApi = {
  /**
   * List directory contents within a task attempt's worktree.
   */
  listWorktreeDirectory: async (
    attemptId: string,
    path?: string
  ): Promise<DirectoryListResponse> => {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/files${queryParam}`
    );
    return handleApiResponse<DirectoryListResponse>(response);
  },

  /**
   * Read file content from a task attempt's worktree.
   */
  readWorktreeFile: async (
    attemptId: string,
    filePath: string
  ): Promise<FileContentResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/files/${encodeURIComponent(filePath)}`
    );
    return handleApiResponse<FileContentResponse>(response);
  },

  /**
   * List directory contents within a project's git repo.
   */
  listProjectDirectory: async (
    projectId: string,
    path?: string
  ): Promise<DirectoryListResponse> => {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await makeRequest(
      `/api/projects/${projectId}/files${queryParam}`
    );
    return handleApiResponse<DirectoryListResponse>(response);
  },

  /**
   * Read file content from a project's git repo.
   */
  readProjectFile: async (
    projectId: string,
    filePath: string
  ): Promise<FileContentResponse> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/files/${encodeURIComponent(filePath)}`
    );
    return handleApiResponse<FileContentResponse>(response);
  },

  /**
   * Read file content from ~/.claude/ directory (security-restricted).
   */
  readClaudeFile: async (
    relativePath: string
  ): Promise<FileContentResponse> => {
    const response = await makeRequest(
      `/api/filesystem/claude-file?path=${encodeURIComponent(relativePath)}`
    );
    return handleApiResponse<FileContentResponse>(response);
  },

  /**
   * Read a file at any absolute path on the filesystem.
   * Used for files referenced by AI agents that are outside the worktree and ~/.claude/.
   */
  readAbsoluteFile: async (path: string): Promise<FileContentResponse> => {
    const response = await makeRequest(
      `/api/filesystem/file?path=${encodeURIComponent(path)}`
    );
    return handleApiResponse<FileContentResponse>(response);
  },
};
