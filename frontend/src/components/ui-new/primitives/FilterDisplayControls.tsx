import * as React from 'react';
import {
  FunnelIcon,
  SlidersHorizontalIcon,
  CaretDownIcon,
} from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui-new/primitives/Dropdown';
import { cn } from '@/lib/utils';
import type { TaskStatus } from 'shared/types';
import { statusLabels } from '@/utils/statusLabels';

// Filter state types
export interface FilterState {
  statuses: TaskStatus[];
  hideEmptyProjects: boolean;
}

// Display state types
export type GroupByOption = 'group' | 'status' | 'none';
export type SortByOption = 'name' | 'updated' | 'created';
export type SortDirection = 'asc' | 'desc';

export interface DisplayState {
  groupBy: GroupByOption;
  sortBy: SortByOption;
  sortDirection: SortDirection;
  compactMode: boolean;
}

// Default states
export const defaultFilterState: FilterState = {
  statuses: [], // empty means all statuses
  hideEmptyProjects: false,
};

export const defaultDisplayState: DisplayState = {
  groupBy: 'group',
  sortBy: 'name',
  sortDirection: 'asc',
  compactMode: false,
};

const ALL_STATUSES: TaskStatus[] = ['todo', 'inprogress', 'inreview', 'done', 'cancelled'];

interface FilterDisplayControlsProps {
  filterState: FilterState;
  displayState: DisplayState;
  onFilterChange: (filter: FilterState) => void;
  onDisplayChange: (display: DisplayState) => void;
}

export function FilterDisplayControls({
  filterState,
  displayState,
  onFilterChange,
  onDisplayChange,
}: FilterDisplayControlsProps) {
  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (filterState.statuses.length > 0 && filterState.statuses.length < ALL_STATUSES.length) {
      count += 1;
    }
    if (filterState.hideEmptyProjects) {
      count += 1;
    }
    return count;
  }, [filterState]);

  const handleStatusToggle = (status: TaskStatus) => {
    const newStatuses = filterState.statuses.includes(status)
      ? filterState.statuses.filter((s) => s !== status)
      : [...filterState.statuses, status];
    onFilterChange({ ...filterState, statuses: newStatuses });
  };

  const handleClearStatusFilters = () => {
    onFilterChange({ ...filterState, statuses: [] });
  };

  const handleHideEmptyProjectsToggle = () => {
    onFilterChange({
      ...filterState,
      hideEmptyProjects: !filterState.hideEmptyProjects,
    });
  };

  return (
    <div className="flex items-center gap-1">
      {/* Filter Button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-sm',
              'text-xs',
              activeFilterCount > 0
                ? 'text-brand bg-brand/10'
                : 'text-low hover:text-normal hover:bg-secondary/60',
              'transition-colors duration-100'
            )}
          >
            <FunnelIcon className="size-3.5" weight={activeFilterCount > 0 ? 'fill' : 'regular'} />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 px-1 py-0.5 text-[10px] bg-brand text-on-brand rounded-sm tabular-nums">
                {activeFilterCount}
              </span>
            )}
            <CaretDownIcon className="size-2.5 ml-0.5" weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Status</span>
            {filterState.statuses.length > 0 && (
              <button
                type="button"
                onClick={handleClearStatusFilters}
                className="text-[10px] text-brand hover:text-brand-hover transition-colors"
              >
                Clear
              </button>
            )}
          </DropdownMenuLabel>
          {ALL_STATUSES.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={filterState.statuses.length === 0 || filterState.statuses.includes(status)}
              onCheckedChange={() => handleStatusToggle(status)}
              onSelect={(e) => e.preventDefault()}
            >
              {statusLabels[status]}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Options</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={filterState.hideEmptyProjects}
            onCheckedChange={handleHideEmptyProjectsToggle}
            onSelect={(e) => e.preventDefault()}
          >
            Hide empty boards
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Display Button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-sm',
              'text-xs text-low',
              'hover:text-normal hover:bg-secondary/60',
              'transition-colors duration-100'
            )}
          >
            <SlidersHorizontalIcon className="size-3.5" />
            <span>Display</span>
            <CaretDownIcon className="size-2.5 ml-0.5" weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Group by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={displayState.groupBy}
            onValueChange={(value) =>
              onDisplayChange({ ...displayState, groupBy: value as GroupByOption })
            }
          >
            <DropdownMenuRadioItem value="group" onSelect={(e) => e.preventDefault()}>
              Project group
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="status" onSelect={(e) => e.preventDefault()}>
              Status
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="none" onSelect={(e) => e.preventDefault()}>
              No grouping
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={displayState.sortBy}
            onValueChange={(value) =>
              onDisplayChange({ ...displayState, sortBy: value as SortByOption })
            }
          >
            <DropdownMenuRadioItem value="name" onSelect={(e) => e.preventDefault()}>
              Name
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="updated" onSelect={(e) => e.preventDefault()}>
              Last updated
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="created" onSelect={(e) => e.preventDefault()}>
              Date created
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Direction</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={displayState.sortDirection}
            onValueChange={(value) =>
              onDisplayChange({ ...displayState, sortDirection: value as SortDirection })
            }
          >
            <DropdownMenuRadioItem value="asc" onSelect={(e) => e.preventDefault()}>
              Ascending
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="desc" onSelect={(e) => e.preventDefault()}>
              Descending
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={displayState.compactMode}
            onCheckedChange={(checked) =>
              onDisplayChange({ ...displayState, compactMode: checked })
            }
            onSelect={(e) => e.preventDefault()}
          >
            Compact mode
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
