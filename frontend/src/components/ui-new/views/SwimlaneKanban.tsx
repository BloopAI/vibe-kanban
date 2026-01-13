import { useMemo } from 'react';
import {
  CaretDownIcon,
  ArrowsOutIcon,
  ArrowsInIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  DotsThreeIcon,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { GroupedProjects } from '@/hooks/useAllBoards';
import type { ProjectGroup, TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { statusLabels, statusBoardColors } from '@/utils/statusLabels';
import { ProjectSwimlane } from '@/components/ui-new/containers/ProjectSwimlane';
import { InlineGroupCreator } from '@/components/ui-new/primitives/InlineGroupCreator';
import {
  FilterDisplayControls,
  type FilterState,
  type DisplayState,
} from '@/components/ui-new/primitives/FilterDisplayControls';

const STATUS_ORDER: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
];

interface SwimlaneKanbanProps {
  groupedProjects: GroupedProjects[];
  groups: ProjectGroup[];
  expandedGroups: Set<string>;
  onToggleGroup: (groupId: string | null) => void;
  onExpandOnly: (groupId: string | null) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isLoading: boolean;
  selectedTaskId: string | null;
  onTaskClick: (projectId: string, taskId: string) => void;
  onCreateTask: (projectId: string, status?: TaskStatus) => void;
  onMoveToGroup: (projectId: string, groupId: string | null) => void;
  onOpenBoard: (projectId: string) => void;
  onCreateGroup: () => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus, task: TaskWithAttemptStatus) => void;
  // Inline group creation props
  isCreatingGroup: boolean;
  newGroupName: string;
  onNewGroupNameChange: (value: string) => void;
  onSubmitCreateGroup: () => void;
  onCancelCreateGroup: () => void;
  // Filter and display props
  filterState: FilterState;
  onFilterChange: (filter: FilterState) => void;
  displayState: DisplayState;
  onDisplayChange: (display: DisplayState) => void;
}

export function SwimlaneKanban({
  groupedProjects,
  groups,
  expandedGroups,
  onToggleGroup,
  onExpandOnly,
  onExpandAll,
  onCollapseAll,
  searchQuery,
  onSearchChange,
  isLoading,
  selectedTaskId,
  onTaskClick,
  onCreateTask,
  onMoveToGroup,
  onOpenBoard,
  onCreateGroup,
  onStatusChange,
  isCreatingGroup,
  newGroupName,
  onNewGroupNameChange,
  onSubmitCreateGroup,
  onCancelCreateGroup,
  filterState,
  onFilterChange,
  displayState,
  onDisplayChange,
}: SwimlaneKanbanProps) {
  // Filter projects by search query
  const filteredGroupedProjects = useMemo(() => {
    if (!searchQuery) return groupedProjects;

    const query = searchQuery.toLowerCase();
    return groupedProjects
      .map(({ group, projects }) => ({
        group,
        projects: projects.filter((p) =>
          p.name.toLowerCase().includes(query)
        ),
      }))
      .filter(({ projects }) => projects.length > 0);
  }, [groupedProjects, searchQuery]);

  if (isLoading) {
    return (
      <div className="h-full flex-1 flex items-center justify-center bg-primary text-low">
        Loading boards...
      </div>
    );
  }

  const allGroupsExpanded = filteredGroupedProjects.every(({ group }) =>
    expandedGroups.has(group?.id ?? 'ungrouped')
  );

  return (
    <div className="h-full flex-1 overflow-y-auto bg-primary">
      {/* Header with search and controls */}
      <div className={cn(
        'sticky top-0 z-20',
        'flex items-center gap-3 px-3 py-2',
        'bg-primary/95 backdrop-blur-sm',
        'border-b border-panel/30'
      )}>
        {/* Search input */}
        <div className={cn(
          'flex items-center gap-2 flex-1 max-w-sm',
          'bg-secondary/60 rounded-sm',
          'border border-panel/30',
          'px-2 py-1',
          'focus-within:border-brand/30 focus-within:bg-secondary/80',
          'transition-all duration-150'
        )}>
          <MagnifyingGlassIcon className="size-3.5 text-low/60 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search boards..."
            className={cn(
              'flex-1 bg-transparent',
              'text-xs text-normal',
              'placeholder:text-low/50',
              'focus:outline-none'
            )}
          />
        </div>

        {/* Filter and Display controls */}
        <FilterDisplayControls
          filterState={filterState}
          displayState={displayState}
          onFilterChange={onFilterChange}
          onDisplayChange={onDisplayChange}
        />

        {/* Divider */}
        <div className="h-4 w-px bg-panel/40" />

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCreateGroup}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-sm',
              'text-xs text-low',
              'hover:text-normal hover:bg-secondary/60',
              'transition-colors duration-100'
            )}
          >
            <PlusIcon className="size-3.5" />
            <span>New Group</span>
          </button>
          <button
            type="button"
            onClick={allGroupsExpanded ? onCollapseAll : onExpandAll}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-sm',
              'text-xs text-low',
              'hover:text-normal hover:bg-secondary/60',
              'transition-colors duration-100'
            )}
          >
            {allGroupsExpanded ? (
              <>
                <ArrowsInIcon className="size-3.5" />
                <span>Collapse all</span>
              </>
            ) : (
              <>
                <ArrowsOutIcon className="size-3.5" />
                <span>Expand all</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Single sticky status header */}
      <div className={cn(
        'sticky top-[40px] z-10',
        'grid grid-cols-[180px_repeat(5,minmax(120px,1fr))]',
        'bg-primary/98 backdrop-blur-sm',
        'border-b border-panel/40'
      )}>
        <div className="py-1.5 px-2" />
        {STATUS_ORDER.map((status) => (
          <div
            key={status}
            className={cn(
              'group/col flex items-center gap-1.5',
              'py-1.5 px-2',
              'border-l border-panel/40'
            )}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: `hsl(var(${statusBoardColors[status]}))` }}
            />
            <span className="text-[10px] text-normal/80 font-medium uppercase tracking-wide flex-1">
              {statusLabels[status]}
            </span>
            <div className={cn(
              'flex items-center gap-0.5',
              'opacity-0 group-hover/col:opacity-100',
              'transition-opacity duration-100'
            )}>
              <button
                type="button"
                className={cn(
                  'p-0.5 rounded-sm',
                  'text-low/60 hover:text-normal',
                  'hover:bg-panel/30',
                  'transition-colors duration-100'
                )}
                title="Column options"
              >
                <DotsThreeIcon weight="bold" className="size-3" />
              </button>
              <button
                type="button"
                className={cn(
                  'p-0.5 rounded-sm',
                  'text-low/60 hover:text-normal',
                  'hover:bg-panel/30',
                  'transition-colors duration-100'
                )}
                title="Add task"
              >
                <PlusIcon className="size-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Groups and swimlanes */}
      <div className="pb-8">
        {/* Inline group creator */}
        <InlineGroupCreator
          isCreating={isCreatingGroup}
          value={newGroupName}
          onChange={onNewGroupNameChange}
          onSubmit={onSubmitCreateGroup}
          onCancel={onCancelCreateGroup}
        />

        {filteredGroupedProjects.length === 0 && !isCreatingGroup ? (
          <div className="text-center py-12 text-low/60 text-xs">
            {searchQuery ? 'No boards match your search' : 'No boards yet'}
          </div>
        ) : (
          filteredGroupedProjects.map(({ group, projects }) => {
            const groupKey = group?.id ?? 'ungrouped';
            const isGroupExpanded = expandedGroups.has(groupKey);

            return (
              <div key={groupKey} className="border-b border-panel/10 last:border-b-0">
                {/* Group header */}
                <div className={cn(
                  'flex items-center justify-between',
                  'px-2 py-1.5',
                  'bg-secondary/30',
                  'border-b border-panel/20'
                )}>
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group?.id ?? null)}
                    className="flex items-center gap-1.5 flex-1 text-left group"
                  >
                    <CaretDownIcon
                      weight="fill"
                      className={cn(
                        'size-2.5 text-low/60',
                        'transition-transform duration-150 ease-out',
                        !isGroupExpanded && '-rotate-90'
                      )}
                    />
                    <span className={cn(
                      'text-[10px] font-medium uppercase tracking-wide',
                      'text-low/70 group-hover:text-normal',
                      'transition-colors duration-100'
                    )}>
                      {group?.name ?? 'Ungrouped'}
                    </span>
                    <span className="text-[10px] text-low/40 tabular-nums">
                      {projects.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onExpandOnly(group?.id ?? null)}
                    className={cn(
                      'px-1.5 py-0.5 rounded-sm',
                      'text-[10px] text-low/40',
                      'hover:text-normal hover:bg-panel/20',
                      'transition-colors duration-100'
                    )}
                    title="Focus on this group"
                  >
                    Focus
                  </button>
                </div>

                {/* Swimlane table */}
                <AnimatePresence initial={false}>
                  {isGroupExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      {/* Project rows */}
                      {projects.length === 0 ? (
                        <div className="py-6 text-center text-[10px] text-low/40">
                          No boards in this group
                        </div>
                      ) : (
                        projects.map((project) => (
                          <ProjectSwimlane
                            key={project.id}
                            project={project}
                            groupId={group?.id ?? null}
                            groups={groups}
                            selectedTaskId={selectedTaskId}
                            onTaskClick={onTaskClick}
                            onCreateTask={onCreateTask}
                            onMoveToGroup={onMoveToGroup}
                            onOpenBoard={onOpenBoard}
                            onStatusChange={onStatusChange}
                            filterState={filterState}
                          />
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
