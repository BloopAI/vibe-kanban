import { XIcon, GitBranchIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { SearchableDropdownContainer } from '@/components/ui-new/containers/SearchableDropdownContainer';
import { DropdownMenuTriggerButton } from '@/components/ui-new/primitives/Dropdown';
import type { GitBranch } from 'shared/types';

interface RepoCardSimpleProps {
  name: string;
  path: string;
  onRemove?: () => void;
  className?: string;
  branches?: GitBranch[];
  selectedBranch?: string | null;
  onBranchChange?: (branch: string) => void;
}

export function RepoCardSimple({
  name,
  path,
  onRemove,
  className,
  branches,
  selectedBranch,
  onBranchChange,
}: RepoCardSimpleProps) {
  return (
    <div
      className={cn('flex flex-col gap-half bg-tertiary rounded-sm', className)}
    >
      <div className="flex items-center gap-base text-normal ">
        <div className="flex-1 flex items-center gap-half">
          <p className="truncate">{name}</p>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-low hover:text-normal flex-shrink-0"
          >
            <XIcon className="size-icon-xs" weight="bold" />
          </button>
        )}
      </div>
      <p className="text-xs text-low truncate">{path}</p>

      {branches && onBranchChange && (
        <SearchableDropdownContainer
          items={branches}
          selectedValue={selectedBranch ?? null}
          getItemKey={(b) => b.name}
          getItemLabel={(b) => b.name}
          filterItem={null}
          getItemBadge={(b) => (b.is_current ? 'Current' : undefined)}
          onSelect={(b) => onBranchChange(b.name)}
          placeholder="Search"
          emptyMessage="No branches found"
          contentClassName="w-[280px]"
          trigger={
            <DropdownMenuTriggerButton
              icon={GitBranchIcon}
              label={selectedBranch || 'Select branch'}
            />
          }
        />
      )}
    </div>
  );
}
