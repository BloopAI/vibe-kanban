import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, FolderGit2 } from 'lucide-react';
import { FolderPickerDialog } from '@/components/dialogs/shared/FolderPickerDialog';
import BranchSelector from '@/components/tasks/BranchSelector';
import type { GitBranch, AttemptRepoInput } from 'shared/types';

export type BranchesByRepoPath = Record<string, GitBranch[]>;

interface AttemptRepoSelectorProps {
  repos: AttemptRepoInput[];
  branchesByRepo: BranchesByRepoPath;
  onUpdate: (repos: AttemptRepoInput[]) => void;
  isLoading?: boolean;
}

export function AttemptRepoSelector({
  repos,
  branchesByRepo,
  onUpdate,
  isLoading,
}: AttemptRepoSelectorProps) {
  const { t } = useTranslation('tasks');
  const [addingRepo, setAddingRepo] = useState(false);

  const handleAddRepository = async () => {
    setAddingRepo(true);
    try {
      const selectedPath = await FolderPickerDialog.show({
        title: t('attemptRepoSelector.addRepo.title'),
        description: t('attemptRepoSelector.addRepo.description'),
        value: '',
      });

      if (!selectedPath) return;

      if (repos.some((r) => r.git_repo_path === selectedPath)) {
        return;
      }

      const display_name = selectedPath.split('/').pop() || selectedPath;
      const repoBranches = branchesByRepo[selectedPath] ?? [];
      const currentBranch =
        repoBranches.find((b) => b.is_current)?.name || 'main';

      onUpdate([
        ...repos,
        {
          git_repo_path: selectedPath,
          display_name,
          target_branch: currentBranch,
        },
      ]);
    } finally {
      setAddingRepo(false);
    }
  };

  const handleRemoveRepo = (index: number) => {
    onUpdate(repos.filter((_, i) => i !== index));
  };

  const handleBranchChange = (index: number, branch: string) => {
    onUpdate(
      repos.map((repo, i) =>
        i === index ? { ...repo, target_branch: branch } : repo
      )
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {t('attemptRepoSelector.label')}{' '}
          <span className="text-destructive">*</span>
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRepository}
          disabled={addingRepo || isLoading}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('attemptRepoSelector.addButton')}
        </Button>
      </div>

      {repos.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center border rounded-md border-dashed">
          {t('attemptRepoSelector.empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {repos.map((repo, index) => (
            <div
              key={repo.git_repo_path}
              className="p-3 border rounded-md bg-muted/30 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FolderGit2 className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {repo.display_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {repo.git_repo_path}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveRepo(index)}
                  disabled={repos.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="pl-6">
                <BranchSelector
                  branches={branchesByRepo[repo.git_repo_path] ?? []}
                  selectedBranch={repo.target_branch}
                  onBranchSelect={(branch) => handleBranchChange(index, branch)}
                  placeholder={t('attemptRepoSelector.selectBranch')}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AttemptRepoSelector;
