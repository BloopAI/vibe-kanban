import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CaretDown,
  ArrowsOut,
  ArrowsIn,
  Kanban,
  DotsThree,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { GroupedProjects } from '@/hooks/useAllBoards';
import type { Project, ProjectGroup } from 'shared/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';

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
}

interface ProjectCardProps {
  project: Project;
  groups: ProjectGroup[];
  currentGroupId: string | null;
  onMoveToGroup: (projectId: string, groupId: string | null) => void;
}

function ProjectCard({
  project,
  groups,
  currentGroupId,
  onMoveToGroup,
}: ProjectCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/projects/${project.id}/tasks`);
  };

  const formattedDate = new Date(project.created_at as unknown as string).toLocaleDateString();

  return (
    <div
      className={cn(
        'flex flex-col p-base bg-secondary rounded border border-panel',
        'hover:border-brand/50 transition-colors cursor-pointer group'
      )}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-half mb-half">
        <div className="flex items-center gap-half min-w-0">
          <Kanban weight="fill" className="size-4 text-brand shrink-0" />
          <span className="font-medium text-normal truncate">{project.name}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-half rounded hover:bg-panel text-low hover:text-normal opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <DotsThree weight="bold" className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}/tasks`)}>
              Open board
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to group</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {currentGroupId && (
                  <>
                    <DropdownMenuItem
                      onClick={() => onMoveToGroup(project.id, null)}
                    >
                      Remove from group
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {groups.map(group => (
                  <DropdownMenuItem
                    key={group.id}
                    onClick={() => onMoveToGroup(project.id, group.id)}
                    disabled={group.id === currentGroupId}
                  >
                    {group.name}
                  </DropdownMenuItem>
                ))}
                {groups.length === 0 && (
                  <div className="px-2 py-1 text-sm text-low">No groups</div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="text-xs text-low">Created {formattedDate}</div>
    </div>
  );
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
        {filteredGroupedProjects.length === 0 ? (
          <div className="text-center py-double text-low">
            {searchQuery ? 'No boards match your search' : 'No boards yet'}
          </div>
        ) : (
          filteredGroupedProjects.map(({ group, projects }) => {
            const groupKey = group?.id ?? 'ungrouped';
            const isExpanded = expandedGroups.has(groupKey);

            return (
              <div key={groupKey} className="border border-panel rounded overflow-hidden">
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
                        'size-4 text-low transition-transform',
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

                {/* Project cards grid */}
                {isExpanded && (
                  <div className="p-base bg-primary">
                    {projects.length === 0 ? (
                      <div className="text-sm text-low text-center py-base">
                        No boards in this group
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-base">
                        {projects.map(project => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            groups={groups}
                            currentGroupId={group?.id ?? null}
                            onMoveToGroup={onMoveToGroup}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
