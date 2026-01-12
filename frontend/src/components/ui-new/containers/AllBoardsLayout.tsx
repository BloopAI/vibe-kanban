import { useState, useCallback } from 'react';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { useAllBoards } from '@/hooks/useAllBoards';
import { AllBoardsSidebar } from '@/components/ui-new/views/AllBoardsSidebar';
import { AllBoardsMain } from '@/components/ui-new/views/AllBoardsMain';
import { NavbarContainer } from '@/components/ui-new/containers/NavbarContainer';
import {
  usePaneSize,
  PERSIST_KEYS,
} from '@/stores/useUiPreferencesStore';
import { useProjectGroupMutations } from '@/hooks/useProjectGroupMutations';

export function AllBoardsLayout() {
  const {
    groupedProjects,
    groups,
    projects,
    isLoading,
    error,
  } = useAllBoards();
  const [searchQuery, setSearchQuery] = useState('');

  // Track which groups are expanded - default all expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    // Start with all groups expanded plus ungrouped
    groups.forEach(g => initial.add(g.id));
    initial.add('ungrouped');
    return initial;
  });

  // Mutations for creating/managing groups
  const { createGroup, assignProjectToGroup } = useProjectGroupMutations();

  const [sidebarWidth, setSidebarWidth] = usePaneSize(
    PERSIST_KEYS.sidebarWidth,
    300
  );

  const handleToggleGroup = useCallback((groupId: string | null) => {
    const key = groupId ?? 'ungrouped';
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleExpandOnly = useCallback((groupId: string | null) => {
    const key = groupId ?? 'ungrouped';
    setExpandedGroups(new Set([key]));
  }, []);

  const handleExpandAll = useCallback(() => {
    const allKeys = new Set<string>();
    groups.forEach(g => allKeys.add(g.id));
    allKeys.add('ungrouped');
    setExpandedGroups(allKeys);
  }, [groups]);

  const handleCollapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  const handlePaneResize = useCallback(
    (sizes: number[]) => {
      if (sizes[0] !== undefined) setSidebarWidth(sizes[0]);
    },
    [setSidebarWidth]
  );

  const handleCreateGroup = useCallback(() => {
    const name = prompt('Enter group name:');
    if (name?.trim()) {
      createGroup.mutate({
        name: name.trim(),
        position: groups.length,
      });
    }
  }, [createGroup, groups.length]);

  const handleMoveToGroup = useCallback(
    (projectId: string, groupId: string | null) => {
      assignProjectToGroup.mutate({ projectId, groupId });
    },
    [assignProjectToGroup]
  );

  if (error) {
    return (
      <div className="flex flex-col h-screen">
        <NavbarContainer />
        <div className="flex-1 flex items-center justify-center bg-primary text-error">
          Error loading boards: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <NavbarContainer />
      <Allotment className="flex-1 min-h-0" onDragEnd={handlePaneResize}>
        <Allotment.Pane
          minSize={250}
          preferredSize={sidebarWidth}
          maxSize={400}
        >
          <AllBoardsSidebar
            groups={groups}
            projects={projects}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onCreateGroup={handleCreateGroup}
            expandedGroups={expandedGroups}
            onToggleGroup={handleToggleGroup}
          />
        </Allotment.Pane>
        <Allotment.Pane minSize={400}>
          <AllBoardsMain
            groupedProjects={groupedProjects}
            groups={groups}
            expandedGroups={expandedGroups}
            onToggleGroup={handleToggleGroup}
            onExpandOnly={handleExpandOnly}
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
            searchQuery={searchQuery}
            isLoading={isLoading}
            onMoveToGroup={handleMoveToGroup}
          />
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}
