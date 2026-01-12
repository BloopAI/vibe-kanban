import { useState, useCallback, useMemo } from 'react';
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
import {
  BoardsDndContext,
  type DragEndEvent,
  type DragStartEvent,
} from '@/components/ui-new/dnd';
import type { Project } from 'shared/types';

export function AllBoardsLayout() {
  const {
    groupedProjects,
    groups,
    projects,
    isLoading,
    error,
  } = useAllBoards();
  const [searchQuery, setSearchQuery] = useState('');

  // Create lookup for projects by ID
  const projectsById = useMemo(() => {
    const map: Record<string, Project> = {};
    projects.forEach(p => {
      map[p.id] = p;
    });
    return map;
  }, [projects]);

  // Track which groups are expanded - default all expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    // Start with all groups expanded plus ungrouped
    groups.forEach(g => initial.add(g.id));
    initial.add('ungrouped');
    return initial;
  });

  // Drag-and-drop state
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  // Inline group creation state
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

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

  // Inline group creation handlers
  const handleStartCreateGroup = useCallback(() => {
    setIsCreatingGroup(true);
    setNewGroupName('');
  }, []);

  const handleSubmitCreateGroup = useCallback(() => {
    if (!newGroupName.trim()) return;
    createGroup.mutate({
      name: newGroupName.trim(),
      position: groups.length,
    });
    setNewGroupName('');
    setIsCreatingGroup(false);
  }, [createGroup, groups.length, newGroupName]);

  const handleCancelCreateGroup = useCallback(() => {
    setIsCreatingGroup(false);
    setNewGroupName('');
  }, []);

  const handleMoveToGroup = useCallback(
    (projectId: string, groupId: string | null) => {
      assignProjectToGroup.mutate({ projectId, groupId });
    },
    [assignProjectToGroup]
  );

  // Drag-and-drop handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const project = projectsById[event.active.id as string];
      setActiveProject(project ?? null);
    },
    [projectsById]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveProject(null);
      const { active, over } = event;

      if (!over) return;

      const projectId = active.id as string;
      const overData = over.data.current;

      // Determine target group
      let targetGroupId: string | null = null;
      if (overData?.type === 'group') {
        targetGroupId = overData.groupId;
      } else if (overData?.type === 'project') {
        // Dropped on another project - use that project's group
        targetGroupId = overData.project?.group_id ?? null;
      }

      // Check if actually changing groups
      const sourceGroupId = active.data.current?.sourceGroupId ?? null;
      if (targetGroupId !== sourceGroupId) {
        assignProjectToGroup.mutate({ projectId, groupId: targetGroupId });
      }
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
      <BoardsDndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        activeProject={activeProject}
        groups={groups}
      >
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
              onCreateGroup={handleStartCreateGroup}
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
              isCreatingGroup={isCreatingGroup}
              newGroupName={newGroupName}
              onNewGroupNameChange={setNewGroupName}
              onSubmitCreateGroup={handleSubmitCreateGroup}
              onCancelCreateGroup={handleCancelCreateGroup}
            />
          </Allotment.Pane>
        </Allotment>
      </BoardsDndContext>
    </div>
  );
}
