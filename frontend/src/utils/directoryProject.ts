import type { Project } from 'shared/types';

/**
 * A project is "directory-only" when it has a working_directory set
 * but no git repositories attached.
 */
export function isDirectoryOnly(
  project: Project | null | undefined,
  reposCount: number
): boolean {
  return Boolean(project?.working_directory && reposCount === 0);
}

export interface CanCreateAttemptParams {
  isDirectoryOnly: boolean;
  hasProfile: boolean;
  allBranchesSelected: boolean;
  reposCount: number;
  isCreating: boolean;
  isLoading: boolean;
}

/**
 * Whether the "create attempt" button should be enabled.
 */
export function canCreateAttempt({
  isDirectoryOnly,
  hasProfile,
  allBranchesSelected,
  reposCount,
  isCreating,
  isLoading,
}: CanCreateAttemptParams): boolean {
  return Boolean(
    hasProfile &&
      (isDirectoryOnly || (allBranchesSelected && reposCount > 0)) &&
      !isCreating &&
      !isLoading
  );
}

/**
 * Git operations UI should only be rendered when there are repos.
 */
export function shouldShowGitOperations(reposCount: number): boolean {
  return reposCount > 0;
}

/**
 * Diff view should not be rendered for directory-only workspaces
 * (identified by an empty branch string).
 */
export function shouldShowDiff(branch: string): boolean {
  return branch !== '';
}
