import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Allotment, LayoutPriority, type AllotmentHandle } from 'allotment';
import 'allotment/dist/style.css';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { CreateModeProvider } from '@/contexts/CreateModeContext';
import { splitMessageToTitleDescription } from '@/utils/string';
import { useScratch } from '@/hooks/useScratch';
import { ScratchType, type DraftWorkspaceData } from 'shared/types';
import { FileNavigationProvider } from '@/contexts/FileNavigationContext';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';
import { WorkspacesMainContainer } from '@/components/ui-new/containers/WorkspacesMainContainer';
import { GitPanel, type RepoInfo } from '@/components/ui-new/views/GitPanel';
import { FileTreeContainer } from '@/components/ui-new/containers/FileTreeContainer';
import { ChangesPanelContainer } from '@/components/ui-new/containers/ChangesPanelContainer';
import { GitPanelCreateContainer } from '@/components/ui-new/containers/GitPanelCreateContainer';
import { CreateChatBoxContainer } from '@/components/ui-new/containers/CreateChatBoxContainer';
import { Navbar } from '@/components/ui-new/views/Navbar';
import { useRenameBranch } from '@/hooks/useRenameBranch';
import { attemptsApi, repoApi } from '@/lib/api';
import { useRepoBranches } from '@/hooks';
import { useWorkspaceMutations } from '@/hooks/useWorkspaceMutations';
import { useDiffStream } from '@/hooks/useDiffStream';
import { useTask } from '@/hooks/useTask';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useMerge } from '@/hooks/useMerge';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import {
  usePaneSize,
  useExpandedAll,
  PERSIST_KEYS,
} from '@/stores/useUiPreferencesStore';
import { useDiffViewMode, useDiffViewStore } from '@/stores/useDiffViewStore';
import { ChangeTargetDialog } from '@/components/ui-new/dialogs/ChangeTargetDialog';
import { RebaseDialog } from '@/components/ui-new/dialogs/RebaseDialog';
import { ConfirmDialog } from '@/components/ui-new/dialogs/ConfirmDialog';
import { CreatePRDialog } from '@/components/dialogs/tasks/CreatePRDialog';
import type { RepoAction } from '@/components/ui-new/primitives/RepoCard';
import type { Workspace, RepoWithTargetBranch, Merge } from 'shared/types';

// Container component for GitPanel that uses hooks requiring GitOperationsProvider
interface GitPanelContainerProps {
  selectedWorkspace: Workspace | undefined;
  repos: RepoWithTargetBranch[];
  repoInfos: RepoInfo[];
  onBranchNameChange: (name: string) => void;
}

function GitPanelContainer({
  selectedWorkspace,
  repos,
  repoInfos,
  onBranchNameChange,
}: GitPanelContainerProps) {
  const { t } = useTranslation(['tasks', 'common']);

  // Fetch task data for PR dialog
  const { data: task } = useTask(selectedWorkspace?.task_id, {
    enabled: !!selectedWorkspace?.task_id,
  });

  // Track selected repo for git operations (default to first repo)
  const [selectedRepoId, setSelectedRepoId] = useState<string | undefined>();

  // Error state for git operations
  const [error, setError] = useState<string | null>(null);
  const activeRepoId = selectedRepoId ?? repos[0]?.id;

  // Fetch branches for the selected repo
  const { data: branches = [] } = useRepoBranches(activeRepoId);

  // Merge hook for merge action
  const merge = useMerge(selectedWorkspace?.id);

  // Handle copying repo path to clipboard
  const handleCopyPath = useCallback(
    (repoId: string) => {
      const repo = repos.find((r) => r.id === repoId);
      if (repo?.path) {
        navigator.clipboard.writeText(repo.path);
      }
    },
    [repos]
  );

  // Handle opening repo in editor
  const handleOpenInEditor = useCallback(async (repoId: string) => {
    try {
      const response = await repoApi.openEditor(repoId, {
        editor_type: null,
        file_path: null,
      });

      // If a URL is returned (remote mode), open it in a new tab
      if (response.url) {
        window.open(response.url, '_blank');
      }
    } catch (err) {
      console.error('Failed to open repo in editor:', err);
      setError(err instanceof Error ? err.message : 'Failed to open editor');
    }
  }, []);

  // Handle GitPanel actions
  const handleActionsClick = useCallback(
    async (repoId: string, action: RepoAction) => {
      if (!selectedWorkspace?.id) return;

      // Update selected repo for git operations
      if (repoId !== activeRepoId) {
        setSelectedRepoId(repoId);
      }

      const repo = repos.find((r) => r.id === repoId);
      const targetBranch = repo?.target_branch;

      switch (action) {
        case 'change-target':
          await ChangeTargetDialog.show({
            attemptId: selectedWorkspace.id,
            repoId,
            branches,
          });
          break;

        case 'rebase':
          await RebaseDialog.show({
            attemptId: selectedWorkspace.id,
            repoId,
            branches,
            initialTargetBranch: targetBranch,
          });
          break;

        case 'pull-request': {
          if (!task) return;
          setError(null);
          const prResult = await CreatePRDialog.show({
            attempt: selectedWorkspace,
            task: {
              ...task,
              has_in_progress_attempt: false,
              last_attempt_failed: false,
              executor: '',
            },
            repoId,
            targetBranch,
          });
          if (!prResult.success && prResult.error) {
            setError(prResult.error);
          }
          break;
        }

        case 'merge': {
          const result = await ConfirmDialog.show({
            title: t('tasks:git.mergeDialog.title'),
            message: t('tasks:git.mergeDialog.description'),
            confirmText: t('tasks:git.states.merge'),
            cancelText: t('common:buttons.cancel'),
          });
          if (result === 'confirmed') {
            try {
              setError(null);
              await merge.mutateAsync({ repoId });
            } catch (err) {
              setError(
                err instanceof Error ? err.message : t('tasks:git.errors.merge')
              );
            }
          }
          break;
        }
      }
    },
    [activeRepoId, repos, branches, selectedWorkspace, task, merge, t]
  );

  return (
    <GitPanel
      repos={repoInfos}
      workingBranchName={selectedWorkspace?.branch ?? ''}
      onWorkingBranchNameChange={onBranchNameChange}
      onActionsClick={handleActionsClick}
      onOpenInEditor={handleOpenInEditor}
      onCopyPath={handleCopyPath}
      onAddRepo={() => console.log('Add repo clicked')}
      error={error}
    />
  );
}

// Fixed UUID for the universal workspace draft (same as in useCreateModeState.ts)
const DRAFT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

export function WorkspacesLayout() {
  const navigate = useNavigate();
  const {
    workspace: selectedWorkspace,
    workspaceId: selectedWorkspaceId,
    sidebarWorkspaces,
    archivedSidebarWorkspaces,
    isLoading,
    isCreateMode,
    selectWorkspace,
    navigateToCreate,
    selectedSession,
    selectedSessionId,
    sessions,
    selectSession,
    repos,
    isNewSessionMode,
    startNewSession,
  } = useWorkspaceContext();
  const [searchQuery, setSearchQuery] = useState('');

  // Read persisted draft for sidebar placeholder (works outside of CreateModeProvider)
  const { scratch: draftScratch } = useScratch(
    ScratchType.DRAFT_WORKSPACE,
    DRAFT_WORKSPACE_ID
  );

  // Extract draft title from persisted scratch
  const persistedDraftTitle = useMemo(() => {
    const scratchData: DraftWorkspaceData | undefined =
      draftScratch?.payload?.type === 'DRAFT_WORKSPACE'
        ? draftScratch.payload.data
        : undefined;

    if (!scratchData?.message?.trim()) return undefined;
    const { title } = splitMessageToTitleDescription(
      scratchData.message.trim()
    );
    return title || 'New Workspace';
  }, [draftScratch]);

  // Selected file path for scroll-to in changes mode (user clicked in FileTree)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  // File currently in view from scrolling (for FileTree highlighting)
  const [fileInView, setFileInView] = useState<string | null>(null);

  // Fetch task for current workspace (used for old UI navigation)
  const { data: selectedWorkspaceTask } = useTask(selectedWorkspace?.task_id, {
    enabled: !!selectedWorkspace?.task_id,
  });

  // Stream real diffs for the selected workspace
  const { diffs: realDiffs } = useDiffStream(
    selectedWorkspace?.id ?? null,
    !isCreateMode && !!selectedWorkspace?.id
  );

  // Workspace mutations (archive/pin/delete)
  const {
    toggleArchive: toggleArchiveMutation,
    togglePin: togglePinMutation,
    deleteWorkspace: deleteWorkspaceMutation,
  } = useWorkspaceMutations({
    onArchiveSuccess: ({ archived, nextWorkspaceId }) => {
      // When archiving, navigate to the next workspace
      if (!archived && nextWorkspaceId) {
        selectWorkspace(nextWorkspaceId);
      }
    },
    onDeleteSuccess: ({ nextWorkspaceId }) => {
      // After deleting, navigate to the next workspace or create mode
      if (nextWorkspaceId) {
        selectWorkspace(nextWorkspaceId);
      } else {
        navigateToCreate();
      }
    },
  });

  // Hook to rename branch via API
  const renameBranch = useRenameBranch(selectedWorkspace?.id);

  // Fetch branch status (including PR/merge info)
  const { data: branchStatus } = useBranchStatus(selectedWorkspace?.id);

  const handleBranchNameChange = useCallback(
    (newName: string) => {
      renameBranch.mutate(newName);
    },
    [renameBranch]
  );

  // Compute diff stats from real diffs
  const diffStats = useMemo(
    () => ({
      filesChanged: realDiffs.length,
      linesAdded: realDiffs.reduce((sum, d) => sum + (d.additions ?? 0), 0),
      linesRemoved: realDiffs.reduce((sum, d) => sum + (d.deletions ?? 0), 0),
    }),
    [realDiffs]
  );

  // Transform repos to RepoInfo format for GitPanel
  const repoInfos: RepoInfo[] = useMemo(
    () =>
      repos.map((repo) => {
        // Find branch status for this repo to get PR info
        const repoStatus = branchStatus?.find((s) => s.repo_id === repo.id);

        // Find the most relevant PR (prioritize open, then merged)
        let prNumber: number | undefined;
        let prUrl: string | undefined;
        let prStatus: 'open' | 'merged' | 'closed' | 'unknown' | undefined;

        if (repoStatus?.merges) {
          const openPR = repoStatus.merges.find(
            (m: Merge) => m.type === 'pr' && m.pr_info.status === 'open'
          );
          const mergedPR = repoStatus.merges.find(
            (m: Merge) => m.type === 'pr' && m.pr_info.status === 'merged'
          );

          const relevantPR = openPR || mergedPR;
          if (relevantPR && relevantPR.type === 'pr') {
            prNumber = Number(relevantPR.pr_info.number);
            prUrl = relevantPR.pr_info.url;
            prStatus = relevantPR.pr_info.status;
          }
        }

        return {
          id: repo.id,
          name: repo.display_name || repo.name,
          targetBranch: repo.target_branch || 'main',
          commitsAhead: repoStatus?.commits_ahead ?? 0,
          filesChanged: diffStats.filesChanged,
          linesAdded: diffStats.linesAdded,
          linesRemoved: diffStats.linesRemoved,
          prNumber,
          prUrl,
          prStatus,
        };
      }),
    [repos, diffStats, branchStatus]
  );

  // Visibility state for sidebar panels
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isGitPanelVisible, setIsGitPanelVisible] = useState(true);
  const [isChangesMode, setIsChangesMode] = useState(false);
  const [isMainPanelVisible, setIsMainPanelVisible] = useState(true);

  // Ref to Allotment for programmatic control
  const allotmentRef = useRef<AllotmentHandle>(null);

  // Reset Allotment sizes when changes panel becomes visible
  // This re-applies preferredSize percentages based on current window size
  useEffect(() => {
    if (isChangesMode && allotmentRef.current) {
      allotmentRef.current.reset();
    }
  }, [isChangesMode]);

  // Reset changes mode when entering create mode
  useEffect(() => {
    if (isCreateMode) {
      setIsChangesMode(false);
    }
  }, [isCreateMode]);

  // Diff view controls
  const diffViewMode = useDiffViewMode();
  const toggleDiffViewMode = useDiffViewStore((s) => s.toggle);
  const { expanded, setExpandedAll } = useExpandedAll();

  // Compute diff keys and expansion state
  const diffKeys = useMemo(
    () => realDiffs.map((d) => `diff:${d.newPath || d.oldPath || ''}`),
    [realDiffs]
  );
  const isAllDiffsExpanded = useMemo(
    () => diffKeys.length > 0 && diffKeys.every((k) => expanded[k] !== false),
    [diffKeys, expanded]
  );

  // Toggle all diffs expanded/collapsed
  const handleToggleAllDiffs = useCallback(() => {
    setExpandedAll(diffKeys, !isAllDiffsExpanded);
  }, [diffKeys, isAllDiffsExpanded, setExpandedAll]);

  // Persisted pane sizes
  const [sidebarWidth, setSidebarWidth] = usePaneSize(
    PERSIST_KEYS.sidebarWidth,
    300
  );
  const [gitPanelWidth, setGitPanelWidth] = usePaneSize(
    PERSIST_KEYS.gitPanelWidth,
    300
  );
  const [changesPanelWidth, setChangesPanelWidth] = usePaneSize(
    PERSIST_KEYS.changesPanelWidth,
    '40%'
  );
  const [fileTreeHeight, setFileTreeHeight] = usePaneSize(
    PERSIST_KEYS.fileTreeHeight,
    '70%'
  );

  // Handle file tree resize (vertical split within git panel)
  const handleFileTreeResize = useCallback(
    (sizes: number[]) => {
      if (sizes[0] !== undefined) setFileTreeHeight(sizes[0]);
    },
    [setFileTreeHeight]
  );

  // Handle pane resize end
  const handlePaneResize = useCallback(
    (sizes: number[]) => {
      // sizes[0] = sidebar, sizes[1] = main, sizes[2] = changes panel, sizes[3] = git panel
      if (sizes[0] !== undefined) setSidebarWidth(sizes[0]);
      if (sizes[3] !== undefined) setGitPanelWidth(sizes[3]);

      // Store changes panel as percentage of TOTAL container width
      // (Allotment percentages are relative to the entire container, not just main+changes)
      const changesWidth = sizes[2];
      if (changesWidth !== undefined) {
        const total = sizes.reduce((sum, s) => sum + (s ?? 0), 0);
        if (total > 0) {
          const percent = Math.round((changesWidth / total) * 100);
          setChangesPanelWidth(`${percent}%`);
        }
      }
    },
    [setSidebarWidth, setGitPanelWidth, setChangesPanelWidth]
  );

  // Panel toggle handlers
  const handleToggleSidebar = useCallback(() => {
    setIsSidebarVisible((prev) => !prev);
  }, []);

  const handleToggleGitPanel = useCallback(() => {
    setIsGitPanelVisible((prev) => !prev);
  }, []);

  const handleToggleChangesMode = useCallback(() => {
    setIsChangesMode((prev) => {
      const newChangesMode = !prev;
      // Auto-hide sidebar when entering changes mode (unless screen is wide enough)
      // Auto-show when exiting changes mode
      const isWideScreen = window.innerWidth > 2048;
      if (newChangesMode && isWideScreen) {
        // Keep sidebar visible on wide screens
      } else {
        setIsSidebarVisible(!newChangesMode);
      }
      return newChangesMode;
    });
  }, []);

  // Navigate to changes panel and scroll to a specific file
  const handleViewFileInChanges = useCallback((filePath: string) => {
    setIsChangesMode(true);
    // Only auto-hide sidebar on narrower screens
    const isWideScreen = window.innerWidth > 2048;
    if (!isWideScreen) {
      setIsSidebarVisible(false);
    }
    setSelectedFilePath(filePath);
  }, []);

  // Compute diffPaths for FileNavigationContext
  const diffPaths = useMemo(() => {
    return new Set(
      realDiffs.map((d) => d.newPath || d.oldPath || '').filter(Boolean)
    );
  }, [realDiffs]);

  const handleToggleMainPanel = useCallback(() => {
    // At least one of Main or Changes must be visible
    if (isMainPanelVisible && !isChangesMode) return;
    setIsMainPanelVisible((prev) => !prev);
  }, [isMainPanelVisible, isChangesMode]);

  const handleToggleArchive = useCallback(() => {
    if (!selectedWorkspace) return;

    // When archiving, find next workspace to select
    let nextWorkspaceId: string | null = null;
    if (!selectedWorkspace.archived) {
      const currentIndex = sidebarWorkspaces.findIndex(
        (ws) => ws.id === selectedWorkspace.id
      );
      if (currentIndex >= 0 && sidebarWorkspaces.length > 1) {
        const nextWorkspace =
          sidebarWorkspaces[currentIndex + 1] ||
          sidebarWorkspaces[currentIndex - 1];
        nextWorkspaceId = nextWorkspace?.id ?? null;
      }
    }

    toggleArchiveMutation.mutate({
      workspaceId: selectedWorkspace.id,
      archived: selectedWorkspace.archived,
      nextWorkspaceId,
    });
  }, [selectedWorkspace, sidebarWorkspaces, toggleArchiveMutation]);

  // Navigate to old UI handler
  const handleNavigateToOldUI = useCallback(() => {
    if (selectedWorkspaceTask?.project_id && selectedWorkspace?.task_id) {
      navigate(
        `/projects/${selectedWorkspaceTask.project_id}/tasks/${selectedWorkspace.task_id}`
      );
    }
  }, [selectedWorkspaceTask?.project_id, selectedWorkspace?.task_id, navigate]);

  // Workspace action handlers
  const handleDeleteWorkspace = useCallback(
    async (workspaceId: string) => {
      const result = await ConfirmDialog.show({
        title: 'Delete Workspace',
        message:
          'Are you sure you want to delete this workspace? This will remove all sessions and execution history. This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'destructive',
      });

      if (result === 'confirmed') {
        // Find next workspace to select after deletion
        const allWorkspaces = [
          ...sidebarWorkspaces,
          ...archivedSidebarWorkspaces,
        ];
        const currentIndex = allWorkspaces.findIndex(
          (ws) => ws.id === workspaceId
        );
        let nextWorkspaceId: string | null = null;
        if (currentIndex >= 0 && allWorkspaces.length > 1) {
          const nextWorkspace =
            allWorkspaces[currentIndex + 1] || allWorkspaces[currentIndex - 1];
          nextWorkspaceId = nextWorkspace?.id ?? null;
        }

        try {
          await deleteWorkspaceMutation.mutateAsync({
            workspaceId,
            nextWorkspaceId,
          });
        } catch (error) {
          console.error('Failed to delete workspace:', error);
        }
      }
    },
    [deleteWorkspaceMutation, sidebarWorkspaces, archivedSidebarWorkspaces]
  );

  const handleArchiveWorkspace = useCallback(
    async (workspaceId: string, isCurrentlyArchived: boolean) => {
      try {
        await attemptsApi.update(workspaceId, {
          archived: !isCurrentlyArchived,
        });
      } catch (error) {
        console.error('Failed to update workspace archive status:', error);
      }
    },
    []
  );

  const handlePinWorkspace = useCallback(
    (workspaceId: string, isCurrentlyPinned: boolean) => {
      togglePinMutation.mutate({
        workspaceId,
        pinned: isCurrentlyPinned,
      });
    },
    [togglePinMutation]
  );

  const handleDuplicateWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        const firstMessage = await attemptsApi.getFirstUserMessage(workspaceId);
        navigate('/workspaces/create', {
          state: { duplicatePrompt: firstMessage },
        });
      } catch (error) {
        console.error('Failed to get workspace prompt for duplication:', error);
        // Navigate to create anyway, just without the pre-filled prompt
        navigate('/workspaces/create');
      }
    },
    [navigate]
  );

  const navbarTitle = isCreateMode
    ? 'Create Workspace'
    : selectedWorkspace?.branch;

  // Get the most recent workspace to auto-select its project and repos in create mode
  const mostRecentWorkspace = sidebarWorkspaces[0];

  const { data: lastWorkspaceTask } = useTask(mostRecentWorkspace?.taskId, {
    enabled: isCreateMode && !!mostRecentWorkspace?.taskId,
  });

  // Fetch repos from the most recent workspace to auto-select in create mode
  const { repos: lastWorkspaceRepos } = useAttemptRepo(
    mostRecentWorkspace?.id,
    {
      enabled: isCreateMode && !!mostRecentWorkspace?.id,
    }
  );

  // Render git panel content - either split (in changes mode) or normal
  const renderGitPanelContent = () => {
    if (isCreateMode) {
      return <GitPanelCreateContainer />;
    }

    if (isChangesMode) {
      // In changes mode, split git panel vertically: file tree on top, git on bottom
      return (
        <Allotment vertical onDragEnd={handleFileTreeResize} proportionalLayout>
          <Allotment.Pane minSize={200} preferredSize={fileTreeHeight}>
            <FileTreeContainer
              key={selectedWorkspace?.id}
              workspaceId={selectedWorkspace?.id}
              diffs={realDiffs}
              selectedFilePath={fileInView}
              onSelectFile={(path) => {
                setSelectedFilePath(path);
                setFileInView(path);
              }}
            />
          </Allotment.Pane>
          <Allotment.Pane minSize={200}>
            <GitPanelContainer
              selectedWorkspace={selectedWorkspace}
              repos={repos}
              repoInfos={repoInfos}
              onBranchNameChange={handleBranchNameChange}
            />
          </Allotment.Pane>
        </Allotment>
      );
    }

    return (
      <GitPanelContainer
        selectedWorkspace={selectedWorkspace}
        repos={repos}
        repoInfos={repoInfos}
        onBranchNameChange={handleBranchNameChange}
      />
    );
  };

  // Render sidebar with persisted draft title
  const renderSidebar = () => (
    <WorkspacesSidebar
      workspaces={sidebarWorkspaces}
      archivedWorkspaces={archivedSidebarWorkspaces}
      selectedWorkspaceId={selectedWorkspaceId ?? null}
      onSelectWorkspace={selectWorkspace}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddWorkspace={navigateToCreate}
      onDeleteWorkspace={handleDeleteWorkspace}
      onArchiveWorkspace={handleArchiveWorkspace}
      onPinWorkspace={handlePinWorkspace}
      onDuplicateWorkspace={handleDuplicateWorkspace}
      isCreateMode={isCreateMode}
      draftTitle={persistedDraftTitle}
      onSelectCreate={navigateToCreate}
    />
  );

  // Render layout content (create mode or workspace mode)
  const renderContent = () => {
    const content = (
      <Allotment
        ref={allotmentRef}
        className="flex-1 min-h-0"
        onDragEnd={handlePaneResize}
      >
        <Allotment.Pane
          minSize={300}
          preferredSize={sidebarWidth}
          maxSize={600}
          visible={isSidebarVisible}
        >
          <div className="h-full overflow-hidden">{renderSidebar()}</div>
        </Allotment.Pane>

        <Allotment.Pane
          visible={isMainPanelVisible}
          priority={LayoutPriority.High}
          minSize={300}
        >
          <div className="h-full overflow-hidden">
            {isCreateMode ? (
              <CreateChatBoxContainer />
            ) : (
              <FileNavigationProvider
                viewFileInChanges={handleViewFileInChanges}
                diffPaths={diffPaths}
              >
                <ExecutionProcessesProvider
                  key={`${selectedWorkspace?.id}-${selectedSessionId}`}
                  attemptId={selectedWorkspace?.id}
                  sessionId={selectedSessionId}
                >
                  <WorkspacesMainContainer
                    selectedWorkspace={selectedWorkspace ?? null}
                    selectedSession={selectedSession}
                    sessions={sessions}
                    onSelectSession={selectSession}
                    isLoading={isLoading}
                    isNewSessionMode={isNewSessionMode}
                    onStartNewSession={startNewSession}
                    onViewCode={handleToggleChangesMode}
                    diffStats={diffStats}
                  />
                </ExecutionProcessesProvider>
              </FileNavigationProvider>
            )}
          </div>
        </Allotment.Pane>

        <Allotment.Pane
          minSize={300}
          preferredSize={changesPanelWidth}
          visible={isChangesMode}
        >
          <div className="h-full overflow-hidden">
            <ChangesPanelContainer
              diffs={realDiffs}
              selectedFilePath={selectedFilePath}
              onFileInViewChange={setFileInView}
            />
          </div>
        </Allotment.Pane>

        <Allotment.Pane
          minSize={300}
          preferredSize={gitPanelWidth}
          maxSize={600}
          visible={isGitPanelVisible}
        >
          <div className="h-full overflow-hidden">
            {renderGitPanelContent()}
          </div>
        </Allotment.Pane>
      </Allotment>
    );

    if (isCreateMode) {
      return (
        <CreateModeProvider
          initialProjectId={lastWorkspaceTask?.project_id}
          initialRepos={lastWorkspaceRepos}
        >
          {content}
        </CreateModeProvider>
      );
    }

    return content;
  };

  return (
    <div className="flex flex-col h-screen">
      <Navbar
        workspaceTitle={navbarTitle}
        isSidebarVisible={isSidebarVisible}
        isMainPanelVisible={isMainPanelVisible}
        isGitPanelVisible={isGitPanelVisible}
        isChangesMode={isChangesMode}
        isCreateMode={isCreateMode}
        isArchived={selectedWorkspace?.archived}
        hasDiffs={realDiffs.length > 0}
        isAllDiffsExpanded={isAllDiffsExpanded}
        diffViewMode={diffViewMode}
        onToggleSidebar={handleToggleSidebar}
        onToggleMainPanel={handleToggleMainPanel}
        onToggleGitPanel={handleToggleGitPanel}
        onToggleChangesMode={handleToggleChangesMode}
        onToggleArchive={selectedWorkspace ? handleToggleArchive : undefined}
        onToggleAllDiffs={handleToggleAllDiffs}
        onToggleDiffViewMode={toggleDiffViewMode}
        onNavigateToOldUI={
          selectedWorkspaceTask?.project_id && selectedWorkspace?.task_id
            ? handleNavigateToOldUI
            : undefined
        }
      />
      {renderContent()}
    </div>
  );
}
