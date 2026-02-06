import { Fragment } from 'react';
import { FunnelIcon, XIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui-new/primitives/Dropdown';
import type { Project } from 'shared/remote-types';
import type { WorkspacePrFilter } from '@/stores/useUiPreferencesStore';

export interface ProjectGroup {
  orgId: string;
  orgName: string;
  projects: Project[];
}

interface WorkspaceSidebarFiltersProps {
  projectGroups: ProjectGroup[];
  selectedProjectIds: string[];
  prFilter: WorkspacePrFilter;
  hasActiveFilters: boolean;
  onProjectFilterChange: (projectIds: string[]) => void;
  onPrFilterChange: (prFilter: WorkspacePrFilter) => void;
  onClearFilters: () => void;
}

const PR_FILTER_OPTIONS: { value: WorkspacePrFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'has_pr', label: 'Has PR' },
  { value: 'no_pr', label: 'No PR' },
];

export function WorkspaceSidebarFilters({
  projectGroups,
  selectedProjectIds,
  prFilter,
  hasActiveFilters,
  onProjectFilterChange,
  onPrFilterChange,
  onClearFilters,
}: WorkspaceSidebarFiltersProps) {
  const toggleProject = (projectId: string) => {
    if (selectedProjectIds.includes(projectId)) {
      onProjectFilterChange(
        selectedProjectIds.filter((id) => id !== projectId)
      );
    } else {
      onProjectFilterChange([...selectedProjectIds, projectId]);
    }
  };

  const hasProjects = projectGroups.some((g) => g.projects.length > 0);
  const showOrgHeaders = projectGroups.length > 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className={cn(
            'hover:text-normal cursor-pointer',
            hasActiveFilters ? 'text-brand' : 'text-low'
          )}
        >
          <FunnelIcon className="size-icon-xs" weight="bold" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {/* Project section */}
        {hasProjects && (
          <>
            <DropdownMenuLabel>Project</DropdownMenuLabel>
            <div className="max-h-40 overflow-y-auto">
              {projectGroups.map((group) => (
                <Fragment key={group.orgId}>
                  {showOrgHeaders && (
                    <DropdownMenuLabel className="text-xs font-normal opacity-70">
                      {group.orgName}
                    </DropdownMenuLabel>
                  )}
                  {group.projects.map((project) => (
                    <DropdownMenuCheckboxItem
                      key={project.id}
                      checked={selectedProjectIds.includes(project.id)}
                      onCheckedChange={() => toggleProject(project.id)}
                      className={cn(
                        'gap-base',
                        showOrgHeaders && 'pl-lg'
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="truncate">{project.name}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </Fragment>
              ))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        {/* PR filter section */}
        <DropdownMenuLabel>Pull Request</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={prFilter}
          onValueChange={(value) =>
            onPrFilterChange(value as WorkspacePrFilter)
          }
        >
          {PR_FILTER_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {/* Clear filters */}
        {hasActiveFilters && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={XIcon} onSelect={onClearFilters}>
              Clear filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
