import { useMemo } from 'react';
import {
  CaretDownIcon,
  ArrowsOutIcon,
  ArrowsInIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { GroupedProjects } from '@/hooks/useAllBoards';
import type { ProjectGroup, TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { statusLabels, statusBoardColors } from '@/utils/statusLabels';
import { ProjectSwimlane } from '@/components/ui-new/containers/ProjectSwimlane';
import { InlineGroupCreator } from '@/components/ui-new/primitives/InlineGroupCreator';

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
      <div className="sticky top-0 z-10 flex items-center gap-base p-base bg-primary border-b border-panel">
        {/* Search input */}
        <div className="flex items-center gap-half flex-1 max-w-md bg-secondary rounded border border-panel px-half">
          <MagnifyingGlassIcon className="size-icon-sm text-low shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search boards..."
            className="flex-1 py-half bg-transparent text-sm text-normal placeholder:text-low focus:outline-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-half">
          <button
            type="button"
            onClick={onCreateGroup}
            className="flex items-center gap-half px-half py-half rounded text-sm text-low hover:text-normal hover:bg-secondary transition-colors"
          >
            <PlusIcon className="size-icon-sm" />
            <span>New Group</span>
          </button>
          <button
            type="button"
            onClick={allGroupsExpanded ? onCollapseAll : onExpandAll}
            className="flex items-center gap-half px-half py-half rounded text-sm text-low hover:text-normal hover:bg-secondary transition-colors"
          >
            {allGroupsExpanded ? (
              <>
                <ArrowsInIcon className="size-icon-sm" />
                <span>Collapse all</span>
              </>
            ) : (
              <>
                <ArrowsOutIcon className="size-icon-sm" />
                <span>Expand all</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Single sticky status header */}
      <div className="sticky top-[48px] z-10 grid grid-cols-[180px_repeat(5,minmax(120px,1fr))] bg-primary border-b border-panel">
        <div className="py-half px-half" />
        {STATUS_ORDER.map((status) => (
          <div
            key={status}
            className="flex items-center justify-between py-half px-base border-l border-panel"
          >
            <span className="flex items-center gap-half text-xs text-normal font-medium tracking-wide">
              <span
                className="h-[6px] w-[6px] rounded-full shrink-0"
                style={{ backgroundColor: `hsl(var(${statusBoardColors[status]}))` }}
              />
              {statusLabels[status]}
            </span>
            <button
              type="button"
              className="p-0.5 rounded text-low hover:text-normal hover:bg-panel transition-colors"
            >
              <PlusIcon className="size-icon-xs" />
            </button>
          </div>
        ))}
      </div>

      {/* Groups and swimlanes */}
      <div className="space-y-half">
        {/* Inline group creator */}
        <InlineGroupCreator
          isCreating={isCreatingGroup}
          value={newGroupName}
          onChange={onNewGroupNameChange}
          onSubmit={onSubmitCreateGroup}
          onCancel={onCancelCreateGroup}
        />

        {filteredGroupedProjects.length === 0 && !isCreatingGroup ? (
          <div className="text-center py-double text-low">
            {searchQuery ? 'No boards match your search' : 'No boards yet'}
          </div>
        ) : (
          filteredGroupedProjects.map(({ group, projects }) => {
            const groupKey = group?.id ?? 'ungrouped';
            const isGroupExpanded = expandedGroups.has(groupKey);

            return (
              <div key={groupKey} className="rounded overflow-hidden">
                {/* Group header */}
                <div className="flex items-center justify-between px-half py-1 bg-secondary/50">
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group?.id ?? null)}
                    className="flex items-center gap-half flex-1 text-left group"
                  >
                    <CaretDownIcon
                      weight="fill"
                      className={cn(
                        'size-icon-xs text-low transition-transform duration-200',
                        !isGroupExpanded && '-rotate-90'
                      )}
                    />
                    <span className="text-xs font-medium text-low group-hover:text-normal transition-colors">
                      {group?.name ?? 'Ungrouped'}
                    </span>
                    <span className="text-xs text-low/60">
                      {projects.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onExpandOnly(group?.id ?? null)}
                    className="px-1 py-0.5 text-xs text-low/60 hover:text-normal rounded transition-colors"
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
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      {/* Project rows */}
                      {projects.length === 0 ? (
                        <div className="p-base text-sm text-low text-center">
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
