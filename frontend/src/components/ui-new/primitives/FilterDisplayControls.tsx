import * as React from 'react';
import {
  FunnelIcon,
  SlidersHorizontalIcon,
  CaretDownIcon,
  LightningIcon,
  EyeIcon,
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
import type { TaskStatus, Project } from 'shared/types';
import { statusLabels } from '@/utils/statusLabels';

// Filter state types
export type WorkspaceFilterOption = 'all' | 'active' | 'in-review';

export interface FilterState {
  statuses: TaskStatus[];
  hideEmptyProjects: boolean;
  selectedProjectId?: string | null; // Filter to single project
  workspaceFilter: WorkspaceFilterOption; // Filter by workspace status
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
  selectedProjectId: null,
  workspaceFilter: 'all',
};

export const defaultDisplayState: DisplayState = {
  groupBy: 'group',
  sortBy: 'name',
  sortDirection: 'asc',
  compactMode: false,
};

const ALL_STATUSES: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
];

interface FilterDisplayControlsProps {
  filterState: FilterState;
  displayState: DisplayState;
  onFilterChange: (filter: FilterState) => void;
  onDisplayChange: (display: DisplayState) => void;
  /** Optional list of projects for project filter */
  projects?: Project[];
  /** Counts for workspace filter badges */
  activeWorkspaceCount?: number;
  inReviewCount?: number;
}

export function FilterDisplayControls({
  filterState,
  displayState,
  onFilterChange,
  onDisplayChange,
  projects = [],
  activeWorkspaceCount = 0,
  inReviewCount = 0,
}: FilterDisplayControlsProps) {
  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (
      filterState.statuses.length > 0 &&
      filterState.statuses.length < ALL_STATUSES.length
    ) {
      count += 1;
    }
    if (filterState.hideEmptyProjects) {
      count += 1;
    }
    if (filterState.workspaceFilter !== 'all') {
      count += 1;
    }
    if (filterState.selectedProjectId) {
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

  const handleWorkspaceFilterChange = (value: WorkspaceFilterOption) => {
    onFilterChange({ ...filterState, workspaceFilter: value });
  };

  const handleProjectFilterChange = (projectId: string | null) => {
    onFilterChange({ ...filterState, selectedProjectId: projectId });
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
            <FunnelIcon
              className="size-3.5"
              weight={activeFilterCount > 0 ? 'fill' : 'regular'}
            />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 px-1 py-0.5 text-[10px] bg-brand text-on-brand rounded-sm tabular-nums">
                {activeFilterCount}
              </span>
            )}
            <CaretDownIcon className="size-2.5 ml-0.5" weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-64 max-h-[400px] overflow-y-auto"
        >
          {/* Workspace Status Filter */}
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Workspace</span>
            {filterState.workspaceFilter !== 'all' && (
              <button
                type="button"
                onClick={() => handleWorkspaceFilterChange('all')}
                className="text-[10px] text-brand hover:text-brand-hover transition-colors"
              >
                Clear
              </button>
            )}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={filterState.workspaceFilter}
            onValueChange={(v) =>
              handleWorkspaceFilterChange(v as WorkspaceFilterOption)
            }
          >
            <DropdownMenuRadioItem
              value="all"
              onSelect={(e) => e.preventDefault()}
            >
              All tasks
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="active"
              onSelect={(e) => e.preventDefault()}
            >
              <span className="flex items-center gap-1.5">
                <LightningIcon className="size-3" weight="fill" />
                Active sessions
                {activeWorkspaceCount > 0 && (
                  <span className="text-[10px] text-low tabular-nums">
                    ({activeWorkspaceCount})
                  </span>
                )}
              </span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="in-review"
              onSelect={(e) => e.preventDefault()}
            >
              <span className="flex items-center gap-1.5">
                <EyeIcon className="size-3" weight="fill" />
                In review
                {inReviewCount > 0 && (
                  <span className="text-[10px] text-low tabular-nums">
                    ({inReviewCount})
                  </span>
                )}
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          {/* Project Filter */}
          {projects.length > 0 && (
            <>
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Project</span>
                {filterState.selectedProjectId && (
                  <button
                    type="button"
                    onClick={() => handleProjectFilterChange(null)}
                    className="text-[10px] text-brand hover:text-brand-hover transition-colors"
                  >
                    Clear
                  </button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={filterState.selectedProjectId ?? 'all'}
                onValueChange={(v) =>
                  handleProjectFilterChange(v === 'all' ? null : v)
                }
              >
                <DropdownMenuRadioItem
                  value="all"
                  onSelect={(e) => e.preventDefault()}
                >
                  All projects
                </DropdownMenuRadioItem>
                {projects.map((project) => (
                  <DropdownMenuRadioItem
                    key={project.id}
                    value={project.id}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="truncate">{project.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Status Filter */}
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
              checked={
                filterState.statuses.length === 0 ||
                filterState.statuses.includes(status)
              }
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
              onDisplayChange({
                ...displayState,
                groupBy: value as GroupByOption,
              })
            }
          >
            <DropdownMenuRadioItem
              value="group"
              onSelect={(e) => e.preventDefault()}
            >
              Project group
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="status"
              onSelect={(e) => e.preventDefault()}
            >
              Status
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="none"
              onSelect={(e) => e.preventDefault()}
            >
              No grouping
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={displayState.sortBy}
            onValueChange={(value) =>
              onDisplayChange({
                ...displayState,
                sortBy: value as SortByOption,
              })
            }
          >
            <DropdownMenuRadioItem
              value="name"
              onSelect={(e) => e.preventDefault()}
            >
              Name
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="updated"
              onSelect={(e) => e.preventDefault()}
            >
              Last updated
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="created"
              onSelect={(e) => e.preventDefault()}
            >
              Date created
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Direction</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={displayState.sortDirection}
            onValueChange={(value) =>
              onDisplayChange({
                ...displayState,
                sortDirection: value as SortDirection,
              })
            }
          >
            <DropdownMenuRadioItem
              value="asc"
              onSelect={(e) => e.preventDefault()}
            >
              Ascending
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="desc"
              onSelect={(e) => e.preventDefault()}
            >
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
