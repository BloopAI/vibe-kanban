import { memo } from 'react';
import BranchSelector from '@/components/tasks/BranchSelector';
import { RepoChip } from '@/components/tasks/RepoChip';
import { cn } from '@/lib/utils';
import type { RepositoryBranches } from 'shared/types';

interface RepoBranchRowProps {
  repository: RepositoryBranches;
  selectedBranch: string;
  onBranchSelect: (branch: string) => void;
  disabled?: boolean;
  className?: string;
}

export const RepoBranchRow = memo(function RepoBranchRow({
  repository,
  selectedBranch,
  onBranchSelect,
  disabled = false,
  className,
}: RepoBranchRowProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="w-1/2 min-w-0">
        <RepoChip name={repository.repository_name} className="truncate max-w-full" />
      </div>
      <div className="w-1/2 min-w-0">
        <BranchSelector
          branches={repository.branches}
          selectedBranch={selectedBranch}
          onBranchSelect={onBranchSelect}
          className={cn(
            'h-8 w-full text-xs',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
      </div>
    </div>
  );
});
