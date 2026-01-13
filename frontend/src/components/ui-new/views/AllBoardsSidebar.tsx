import { Plus, CaretRight, Folder, FolderOpen } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { Project, ProjectGroup } from 'shared/types';

interface AllBoardsSidebarProps {
  groups: ProjectGroup[];
  projects: Project[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onCreateGroup: () => void;
  expandedGroups: Set<string>;
  onToggleGroup: (groupId: string | null) => void;
}

export function AllBoardsSidebar({
  groups,
  projects,
  searchQuery,
  onSearchChange,
  onCreateGroup,
  expandedGroups,
  onToggleGroup,
}: AllBoardsSidebarProps) {
  const ungroupedCount = projects.filter(p => !p.group_id).length;

  return (
    <div className="w-full h-full bg-secondary flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-base border-b border-panel">
        <span className="font-medium text-high">All Boards</span>
        <button
          type="button"
          onClick={onCreateGroup}
          className="p-half rounded hover:bg-panel text-low hover:text-normal transition-colors"
          title="Create group"
        >
          <Plus weight="bold" className="size-4" />
        </button>
      </div>

      {/* Search */}
      <div className="p-base border-b border-panel">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search boards..."
          className="w-full px-base py-half bg-primary rounded border border-panel text-sm text-normal placeholder:text-low focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {/* Groups navigation */}
      <div className="flex-1 overflow-y-auto p-half">
        <div className="text-xs text-low uppercase tracking-wide px-half py-half mb-half">
          Groups
        </div>

        {groups.map(group => {
          const groupProjectCount = projects.filter(p => p.group_id === group.id).length;
          const isExpanded = expandedGroups.has(group.id);

          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onToggleGroup(group.id)}
              className={cn(
                'w-full flex items-center gap-half px-half py-half rounded text-sm',
                'hover:bg-panel transition-colors text-left',
                isExpanded ? 'text-high' : 'text-normal'
              )}
            >
              <CaretRight
                weight="fill"
                className={cn(
                  'size-3 text-low transition-transform shrink-0',
                  isExpanded && 'rotate-90'
                )}
              />
              {isExpanded ? (
                <FolderOpen weight="fill" className="size-4 text-brand shrink-0" />
              ) : (
                <Folder weight="fill" className="size-4 text-low shrink-0" />
              )}
              <span className="truncate flex-1">{group.name}</span>
              <span className="text-xs text-low shrink-0">{groupProjectCount}</span>
            </button>
          );
        })}

        {/* Ungrouped section */}
        {ungroupedCount > 0 && (
          <button
            type="button"
            onClick={() => onToggleGroup(null)}
            className={cn(
              'w-full flex items-center gap-half px-half py-half rounded text-sm',
              'hover:bg-panel transition-colors text-left',
              expandedGroups.has('ungrouped') ? 'text-high' : 'text-normal'
            )}
          >
            <CaretRight
              weight="fill"
              className={cn(
                'size-3 text-low transition-transform shrink-0',
                expandedGroups.has('ungrouped') && 'rotate-90'
              )}
            />
            {expandedGroups.has('ungrouped') ? (
              <FolderOpen weight="fill" className="size-4 text-low shrink-0" />
            ) : (
              <Folder weight="fill" className="size-4 text-low shrink-0" />
            )}
            <span className="truncate flex-1 italic">Ungrouped</span>
            <span className="text-xs text-low shrink-0">{ungroupedCount}</span>
          </button>
        )}

        {groups.length === 0 && ungroupedCount === 0 && (
          <div className="px-half py-base text-sm text-low text-center">
            No groups yet
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="p-base border-t border-panel text-xs text-low">
        {groups.length} groups, {projects.length} boards
      </div>
    </div>
  );
}
