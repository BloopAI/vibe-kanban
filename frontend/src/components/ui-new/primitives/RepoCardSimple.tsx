import {
  FolderSimpleIcon,
  XIcon,
  GitBranchIcon,
  CaretDownIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { SearchableDropdown } from './SearchableDropdown';
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
          <FolderSimpleIcon className="size-icon-base" weight="fill" />
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
        <SearchableDropdown
          items={branches}
          selectedValue={selectedBranch}
          getItemKey={(b) => b.name}
          getItemLabel={(b) => b.name}
          getItemBadge={(b) => (b.is_current ? 'Current' : undefined)}
          onSelect={(b) => onBranchChange(b.name)}
          placeholder="Search"
          emptyMessage="No branches found"
          contentClassName="w-[280px]"
          trigger={
            <button
              type="button"
              className="flex items-center gap-half bg-panel rounded-sm px-base py-half w-full focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            >
              <GitBranchIcon
                className="size-icon-xs text-low flex-shrink-0"
                weight="bold"
              />
              <span className="text-sm text-normal truncate flex-1 text-left">
                {selectedBranch || 'Select branch'}
              </span>
              <CaretDownIcon
                className="size-icon-2xs text-low flex-shrink-0"
                weight="bold"
              />
            </button>
          }
        />
      )}
    </div>
  );
}
