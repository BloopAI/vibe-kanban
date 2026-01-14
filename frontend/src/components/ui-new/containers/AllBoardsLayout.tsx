import { useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Allotment, type AllotmentHandle } from 'allotment';
import 'allotment/dist/style.css';
import { useAllBoards } from '@/hooks/useAllBoards';
import { SwimlaneKanban } from '@/components/ui-new/views/SwimlaneKanban';
import { Navbar } from '@/components/layout/Navbar';
import { useProjectGroupMutations } from '@/hooks/useProjectGroupMutations';
import { openTaskForm } from '@/lib/openTaskForm';
import { TaskDetailsPanel } from '@/components/ui-new/containers/TaskDetailsPanel';
import { LeftSidebar } from '@/components/ui-new/views/LeftSidebar';
import { CreateProjectDialog } from '@/components/ui-new/dialogs/CreateProjectDialog';
import { useWorkspaces } from '@/components/ui-new/hooks/useWorkspaces';
import { tasksApi, attemptsApi } from '@/lib/api';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { usePaneSize, PERSIST_KEYS } from '@/stores/useUiPreferencesStore';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import {
  type FilterState,
  type DisplayState,
  defaultFilterState,
  defaultDisplayState,
} from '@/components/ui-new/primitives/FilterDisplayControls';

export function AllBoardsLayout() {
  const navigate = useNavigate();
  const { groupedProjects, groups, isLoading, error } = useAllBoards();
  const [searchQuery, setSearchQuery] = useState('');

  // Left sidebar state
  const allotmentRef = useRef<AllotmentHandle>(null);
  const isLeftSidebarVisible = useLayoutStore((s) => s.isLeftSidebarVisible);
  const toggleLeftSidebar = useLayoutStore((s) => s.toggleLeftSidebar);
  const [leftSidebarWidth, setLeftSidebarWidth] = usePaneSize(
    PERSIST_KEYS.leftSidebarWidth,
    240
  );

  // Get workspace data for sidebar and filter counts
  const { workspaces } = useWorkspaces();

  // Compute active workspaces count (running AI sessions)
  const activeWorkspaceCount = useMemo(
    () => workspaces.filter((ws) => ws.isRunning).length,
    [workspaces]
  );

  // Compute in-review count (workspaces with open PRs)
  const inReviewCount = useMemo(
    () => workspaces.filter((ws) => ws.prStatus === 'open').length,
    [workspaces]
  );

  // Flatten all projects for filter dropdown
  const allProjects = useMemo(
    () => groupedProjects.flatMap((gp) => gp.projects),
    [groupedProjects]
  );

  const handlePaneResize = useCallback(
    (sizes: number[]) => {
      if (sizes[0] !== undefined && isLeftSidebarVisible) {
        setLeftSidebarWidth(sizes[0]);
      }
    },
    [isLeftSidebarVisible, setLeftSidebarWidth]
  );

  // Filter and display state
  const [filterState, setFilterState] =
    useState<FilterState>(defaultFilterState);
  const [displayState, setDisplayState] =
    useState<DisplayState>(defaultDisplayState);

  // Track which groups are expanded - default all expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    // Start with all groups expanded plus ungrouped
    groups.forEach((g) => initial.add(g.id));
    initial.add('ungrouped');
    return initial;
  });

  // Inline group creation state
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Track selected project and task for the details panel
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Mutations for creating/managing groups
  const { createGroup, assignProjectToGroup } = useProjectGroupMutations();

  const handleToggleGroup = useCallback((groupId: string | null) => {
    const key = groupId ?? 'ungrouped';
    setExpandedGroups((prev) => {
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
    groups.forEach((g) => allKeys.add(g.id));
    allKeys.add('ungrouped');
    setExpandedGroups(allKeys);
  }, [groups]);

  const handleCollapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  const handleTaskClick = useCallback((projectId: string, taskId: string) => {
    setSelectedProjectId(projectId);
    setSelectedTaskId(taskId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedProjectId(null);
    setSelectedTaskId(null);
  }, []);

  const handleOpenBoard = useCallback(
    (projectId: string) => {
      navigate(`/projects/${projectId}/tasks`);
    },
    [navigate]
  );

  // Sidebar action handlers
  const handleSidebarCreateTask = useCallback(() => {
    // Open task form dialog - user will select project in the dialog
    openTaskForm({ mode: 'create' });
  }, []);

  const handleSidebarCreateProject = useCallback(() => {
    // Open project creation dialog
    CreateProjectDialog.show({});
  }, []);

  const handleStopWorkspace = useCallback(async (workspaceId: string) => {
    try {
      await attemptsApi.stop(workspaceId);
      // WebSocket will update the UI automatically
    } catch (err) {
      console.error('Failed to stop workspace:', err);
    }
  }, []);

  const handleSidebarWorkspaceClick = useCallback(
    (workspaceId: string) => {
      // Navigate to the workspace view
      navigate(`/workspaces/${workspaceId}`);
    },
    [navigate]
  );

  const handleCreateTask = useCallback(
    (projectId: string, status?: TaskStatus) => {
      openTaskForm({ mode: 'create', projectId, initialStatus: status });
    },
    []
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

  const handleStatusChange = useCallback(
    async (
      taskId: string,
      newStatus: TaskStatus,
      task: TaskWithAttemptStatus
    ) => {
      try {
        await tasksApi.update(taskId, {
          title: task.title,
          description: task.description,
          status: newStatus,
          parent_workspace_id: task.parent_workspace_id,
          image_ids: null,
          priority: null,
          due_date: null,
          labels: null,
        });
      } catch (err) {
        console.error('Failed to update task status:', err);
      }
    },
    []
  );

  if (error) {
    return (
      <div className="flex flex-col h-screen">
        <Navbar />
        <div className="flex-1 flex items-center justify-center bg-primary text-error">
          Error loading boards: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex-1 min-h-0">
        <Allotment ref={allotmentRef} onDragEnd={handlePaneResize}>
          <Allotment.Pane
            minSize={isLeftSidebarVisible ? 200 : 0}
            maxSize={isLeftSidebarVisible ? 400 : 0}
            preferredSize={isLeftSidebarVisible ? Number(leftSidebarWidth) : 0}
            visible={isLeftSidebarVisible}
          >
            <LeftSidebar
              appName="Vibe Kanban"
              workspaces={workspaces}
              onCreateTask={handleSidebarCreateTask}
              onCreateProject={handleSidebarCreateProject}
              onStopWorkspace={handleStopWorkspace}
              onWorkspaceClick={handleSidebarWorkspaceClick}
              onToggleSidebar={toggleLeftSidebar}
            />
          </Allotment.Pane>
          <Allotment.Pane minSize={400}>
            <SwimlaneKanban
              groupedProjects={groupedProjects}
              groups={groups}
              expandedGroups={expandedGroups}
              onToggleGroup={handleToggleGroup}
              onExpandOnly={handleExpandOnly}
              onExpandAll={handleExpandAll}
              onCollapseAll={handleCollapseAll}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              isLoading={isLoading}
              selectedTaskId={selectedTaskId}
              onTaskClick={handleTaskClick}
              onCreateTask={handleCreateTask}
              onMoveToGroup={handleMoveToGroup}
              onOpenBoard={handleOpenBoard}
              onCreateGroup={handleStartCreateGroup}
              onStatusChange={handleStatusChange}
              isCreatingGroup={isCreatingGroup}
              newGroupName={newGroupName}
              onNewGroupNameChange={setNewGroupName}
              onSubmitCreateGroup={handleSubmitCreateGroup}
              onCancelCreateGroup={handleCancelCreateGroup}
              isLeftSidebarVisible={isLeftSidebarVisible}
              onToggleLeftSidebar={toggleLeftSidebar}
              filterState={filterState}
              onFilterChange={setFilterState}
              displayState={displayState}
              onDisplayChange={setDisplayState}
              workspaces={workspaces}
              projects={allProjects}
              activeWorkspaceCount={activeWorkspaceCount}
              inReviewCount={inReviewCount}
            />
          </Allotment.Pane>
          <Allotment.Pane
            minSize={selectedTaskId ? 400 : 0}
            visible={!!selectedTaskId}
          >
            {selectedProjectId && selectedTaskId && (
              <TaskDetailsPanel
                projectId={selectedProjectId}
                taskId={selectedTaskId}
                onClose={handleClosePanel}
              />
            )}
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
}
