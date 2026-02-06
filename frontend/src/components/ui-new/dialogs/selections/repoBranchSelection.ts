import type { RepoItem, BranchItem } from '@/components/ui-new/actions/pages';
import type { SelectionPage } from '../SelectionDialog';

export interface RepoBranchSelectionResult {
  repoId: string;
  repoDisplayName: string;
  branch: string;
}

export function buildRepoBranchSelectionPages(
  repos: RepoItem[],
  getBranches: (repoId: string) => BranchItem[]
): Record<string, SelectionPage<RepoBranchSelectionResult>> {
  // Track selected repo for the branch step
  let selectedRepo: RepoItem | null = null;

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
          selectedRepo = item.repo;
          return { type: 'navigate', pageId: 'selectBranch' };
        }
        return { type: 'complete', data: undefined as never };
      },
    },
    selectBranch: {
      id: 'selectBranch',
      get title() {
        return selectedRepo
          ? `Select Branch for ${selectedRepo.display_name}`
          : 'Select Branch';
      },
      buildGroups: () => {
        if (!selectedRepo) return [];
        const branches = getBranches(selectedRepo.id);
        return [
          {
            label: 'Branches',
            items: branches.map((b) => ({
              type: 'branch' as const,
              branch: b,
            })),
          },
        ];
      },
      onSelect: (item) => {
        if (item.type === 'branch' && selectedRepo) {
          return {
            type: 'complete',
            data: {
              repoId: selectedRepo.id,
              repoDisplayName: selectedRepo.display_name,
              branch: item.branch.name,
            },
          };
        }
        return { type: 'complete', data: undefined as never };
      },
    },
  };
}
