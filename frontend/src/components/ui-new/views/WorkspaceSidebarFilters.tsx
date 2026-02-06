import { FunnelIcon, XIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui-new/primitives/Popover';
import type { Project } from 'shared/remote-types';
import type { WorkspacePrFilter } from '@/stores/useUiPreferencesStore';

interface WorkspaceSidebarFiltersProps {
  projects: Project[];
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
  projects,
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

  return (
    <Popover>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="flex flex-col">
          {/* Project section */}
          {projects.length > 0 && (
            <div className="flex flex-col">
              <span className="px-base pt-base pb-half text-xs font-semibold text-low">
                Project
              </span>
              <div className="flex flex-col max-h-40 overflow-y-auto">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => toggleProject(project.id)}
                    className={cn(
                      'flex items-center gap-base px-base py-half text-sm text-left',
                      'hover:bg-secondary transition-colors',
                      selectedProjectIds.includes(project.id)
                        ? 'text-high'
                        : 'text-low'
                    )}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="truncate flex-1">{project.name}</span>
                    {selectedProjectIds.includes(project.id) && (
                      <svg
                        className="size-icon-xs shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Separator */}
          <div className="h-px bg-border mx-base" />

          {/* PR filter section */}
          <div className="flex flex-col">
            <span className="px-base pt-base pb-half text-xs font-semibold text-low">
              Pull Request
            </span>
            <div className="flex flex-col">
              {PR_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onPrFilterChange(option.value)}
                  className={cn(
                    'flex items-center gap-base px-base py-half text-sm text-left',
                    'hover:bg-secondary transition-colors',
                    prFilter === option.value ? 'text-high' : 'text-low'
                  )}
                >
                  <span
                    className={cn(
                      'w-3 h-3 rounded-full border shrink-0 flex items-center justify-center',
                      prFilter === option.value
                        ? 'border-brand'
                        : 'border-low'
                    )}
                  >
                    {prFilter === option.value && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                    )}
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <>
              <div className="h-px bg-border mx-base" />
              <button
                type="button"
                onClick={onClearFilters}
                className="flex items-center gap-half px-base py-base text-sm text-low hover:text-normal transition-colors"
              >
                <XIcon className="size-icon-xs" weight="bold" />
                <span>Clear filters</span>
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
