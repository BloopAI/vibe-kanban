import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RepoBranchRow } from '@/components/tasks/RepoBranchRow';
import { cn } from '@/lib/utils';
import type { RepositoryBranches } from 'shared/types';

type RepoBranchMap = Record<string, string>;

interface RepoBranchSelectorProps {
  repositories: RepositoryBranches[];
  selectedBranches: RepoBranchMap;
  onBranchChange: (repoId: string, branch: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const RepoBranchSelector = memo(function RepoBranchSelector({
  repositories,
  selectedBranches,
  onBranchChange,
  disabled = false,
  className,
  placeholder,
}: RepoBranchSelectorProps) {
  const { t } = useTranslation(['common']);
  const [open, setOpen] = useState(false);

  const effectivePlaceholder =
    placeholder ?? t('repoBranchSelector.placeholder', 'Base branches');

  if (repositories.length === 0) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn('w-full justify-between text-xs', className)}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <GitBranch className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{effectivePlaceholder}</span>
          </div>
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80 p-2"
        onInteractOutside={(e) => {
          // Prevent closing when interacting with nested BranchSelector dropdowns
          const target = e.target as HTMLElement;
          if (target.closest('[data-radix-popper-content-wrapper]')) {
            e.preventDefault();
          }
        }}
      >
        <div className="flex flex-col gap-2">
          {repositories.map((repo) => (
            <RepoBranchRow
              key={repo.repository_id}
              repository={repo}
              selectedBranch={selectedBranches[repo.repository_id] ?? ''}
              onBranchSelect={(branch) =>
                onBranchChange(repo.repository_id, branch)
              }
              disabled={disabled}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
