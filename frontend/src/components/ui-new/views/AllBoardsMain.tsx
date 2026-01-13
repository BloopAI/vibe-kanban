import { useMemo } from 'react';
import {
  CaretDown,
  ArrowsOut,
  ArrowsIn,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { GroupedProjects } from '@/hooks/useAllBoards';
import type { ProjectGroup } from 'shared/types';
import { DroppableGroup, EmptyGroupDropZone } from '@/components/ui-new/dnd/DroppableGroup';
import { DraggableProjectCard } from '@/components/ui-new/dnd/DraggableProjectCard';
import { InlineGroupCreator } from '@/components/ui-new/primitives/InlineGroupCreator';

interface AllBoardsMainProps {
  groupedProjects: GroupedProjects[];
  groups: ProjectGroup[];
  expandedGroups: Set<string>;
  onToggleGroup: (groupId: string | null) => void;
  onExpandOnly: (groupId: string | null) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  searchQuery: string;
  isLoading: boolean;
  onMoveToGroup: (projectId: string, groupId: string | null) => void;
  // Inline group creation props
  isCreatingGroup: boolean;
  newGroupName: string;
  onNewGroupNameChange: (value: string) => void;
  onSubmitCreateGroup: () => void;
  onCancelCreateGroup: () => void;
}

export function AllBoardsMain({
  groupedProjects,
  groups,
  expandedGroups,
  onToggleGroup,
  onExpandOnly,
  onExpandAll,
  onCollapseAll,
  searchQuery,
  isLoading,
  onMoveToGroup,
  isCreatingGroup,
  newGroupName,
  onNewGroupNameChange,
  onSubmitCreateGroup,
  onCancelCreateGroup,
}: AllBoardsMainProps) {
  // Filter projects by search query
  const filteredGroupedProjects = useMemo(() => {
    if (!searchQuery) return groupedProjects;

    const query = searchQuery.toLowerCase();
    return groupedProjects
      .map(({ group, projects }) => ({
        group,
        projects: projects.filter(p =>
          p.name.toLowerCase().includes(query)
        ),
      }))
      .filter(({ projects }) => projects.length > 0);
  }, [groupedProjects, searchQuery]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-primary text-low">
        Loading boards...
      </div>
    );
  }

  const allExpanded = filteredGroupedProjects.every(({ group }) =>
    expandedGroups.has(group?.id ?? 'ungrouped')
  );

  return (
    <div className="h-full overflow-y-auto bg-primary">
      {/* Header with expand/collapse controls */}
      <div className="sticky top-0 z-10 flex items-center justify-between p-base bg-primary border-b border-panel">
        <h2 className="font-medium text-high">
          {searchQuery ? `Search results for "${searchQuery}"` : 'All Boards'}
        </h2>
        <div className="flex items-center gap-half">
          <button
            type="button"
            onClick={allExpanded ? onCollapseAll : onExpandAll}
            className="flex items-center gap-half px-half py-half rounded text-sm text-low hover:text-normal hover:bg-secondary transition-colors"
          >
            {allExpanded ? (
              <>
                <ArrowsIn className="size-4" />
                <span>Collapse all</span>
              </>
            ) : (
              <>
                <ArrowsOut className="size-4" />
                <span>Expand all</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Groups and projects */}
      <div className="p-base space-y-base">
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
            const isExpanded = expandedGroups.has(groupKey);

            return (
              <DroppableGroup
                key={groupKey}
                groupId={group?.id ?? null}
              >
                {/* Group header */}
                <div className="flex items-center justify-between bg-secondary px-base py-half">
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group?.id ?? null)}
                    className="flex items-center gap-half flex-1 text-left"
                  >
                    <CaretDown
                      weight="fill"
                      className={cn(
                        'size-4 text-low transition-transform duration-200',
                        !isExpanded && '-rotate-90'
                      )}
                    />
                    <span className="font-medium text-normal">
                      {group?.name ?? 'Ungrouped'}
                    </span>
                    <span className="text-sm text-low">
                      ({projects.length})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onExpandOnly(group?.id ?? null)}
                    className="px-half py-half text-xs text-low hover:text-normal hover:bg-panel rounded transition-colors"
                    title="Focus on this group"
                  >
                    Focus
                  </button>
                </div>

                {/* Project cards grid with animation */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="p-base bg-primary">
                        {projects.length === 0 ? (
                          <EmptyGroupDropZone />
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-base">
                            {projects.map(project => (
                              <DraggableProjectCard
                                key={project.id}
                                project={project}
                                groupId={group?.id ?? null}
                                groups={groups}
                                onMoveToGroup={onMoveToGroup}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </DroppableGroup>
            );
          })
        )}
      </div>
    </div>
  );
}
