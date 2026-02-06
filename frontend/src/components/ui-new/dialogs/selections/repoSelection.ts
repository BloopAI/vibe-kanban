import type { RepoItem, BranchItem } from '@/components/ui-new/actions/pages';
import type { SelectionPage } from '../SelectionDialog';

// Repo-only selection (for git action disambiguation)
export interface RepoSelectionResult {
  repoId: string;
}

export function buildRepoSelectionPages(
  repos: RepoItem[]
): Record<string, SelectionPage<RepoSelectionResult>> {
  return {
    selectRepo: {
      id: 'selectRepo',
      title: 'Select Repository',
      buildGroups: () => [
        {
          label: 'Repositories',
          items: repos.map((r) => ({ type: 'repo' as const, repo: r })),
        },
      ],
      onSelect: (item) => {
        if (item.type === 'repo') {
          return { type: 'complete', data: { repoId: item.repo.id } };
        }
        return { type: 'complete', data: undefined as never };
      },
    },
  };
}

// Branch-only selection (given a repo's branches, pick one)
export interface BranchSelectionResult {
  branch: string;
}

export function buildBranchSelectionPages(
  branches: BranchItem[],
  repoDisplayName?: string
): Record<string, SelectionPage<BranchSelectionResult>> {
  return {
    selectBranch: {
      id: 'selectBranch',
      title: repoDisplayName
        ? `Select Branch for ${repoDisplayName}`
        : 'Select Branch',
      buildGroups: () => [
        {
          label: 'Branches',
          items: branches.map((b) => ({
            type: 'branch' as const,
            branch: b,
          })),
        },
      ],
      onSelect: (item) => {
        if (item.type === 'branch') {
          return { type: 'complete', data: { branch: item.branch.name } };
        }
        return { type: 'complete', data: undefined as never };
      },
    },
  };
}
