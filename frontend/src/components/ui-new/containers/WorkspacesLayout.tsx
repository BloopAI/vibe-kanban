import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Group, Layout, Panel, Separator } from 'react-resizable-panels';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useActions } from '@/contexts/ActionsContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { CreateModeProvider } from '@/contexts/CreateModeContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { splitMessageToTitleDescription } from '@/utils/string';
import { useScratch } from '@/hooks/useScratch';
import { ScratchType, type DraftWorkspaceData } from 'shared/types';
import { FileNavigationProvider } from '@/contexts/FileNavigationContext';
import { LogNavigationProvider } from '@/contexts/LogNavigationContext';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';
import {
  LogsContentContainer,
  type LogsPanelContent,
} from '@/components/ui-new/containers/LogsContentContainer';
import { ProcessListContainer } from '@/components/ui-new/containers/ProcessListContainer';
import { WorkspacesMainContainer } from '@/components/ui-new/containers/WorkspacesMainContainer';
import { GitPanel, type RepoInfo } from '@/components/ui-new/views/GitPanel';
import { FileTreeContainer } from '@/components/ui-new/containers/FileTreeContainer';
import { ChangesPanelContainer } from '@/components/ui-new/containers/ChangesPanelContainer';
import { GitPanelCreateContainer } from '@/components/ui-new/containers/GitPanelCreateContainer';
import { CreateChatBoxContainer } from '@/components/ui-new/containers/CreateChatBoxContainer';
import { NavbarContainer } from '@/components/ui-new/containers/NavbarContainer';
import { PreviewBrowserContainer } from '@/components/ui-new/containers/PreviewBrowserContainer';
import { PreviewControlsContainer } from '@/components/ui-new/containers/PreviewControlsContainer';
import { useRenameBranch } from '@/hooks/useRenameBranch';
import { usePush } from '@/hooks/usePush';
import { repoApi } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui-new/dialogs/ConfirmDialog';
import { ForcePushDialog } from '@/components/dialogs/git/ForcePushDialog';
import { WorkspacesGuideDialog } from '@/components/ui-new/dialogs/WorkspacesGuideDialog';
import { useUserSystem } from '@/components/ConfigProvider';
import { useDiffStream } from '@/hooks/useDiffStream';
import { useTask } from '@/hooks/useTask';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import {
  PERSIST_KEYS,
  useExpandedAll,
  usePaneSize,
  usePersistedExpanded,
} from '@/stores/useUiPreferencesStore';
import {
  useLayoutStore,
  useIsRightMainPanelVisible,
} from '@/stores/useLayoutStore';
import { useDiffViewStore } from '@/stores/useDiffViewStore';
import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';
import { useCommandBarShortcut } from '@/hooks/useCommandBarShortcut';
import { Actions } from '@/components/ui-new/actions';
import type { RepoAction } from '@/components/ui-new/primitives/RepoCard';
import type { Workspace, RepoWithTargetBranch, Merge } from 'shared/types';
import { useNavigate } from 'react-router-dom';

// Container component for GitPanel that uses hooks requiring GitOperationsProvider
interface GitPanelContainerProps {
  selectedWorkspace: Workspace | undefined;
  repos: RepoWithTargetBranch[];
  repoInfos: RepoInfo[];
  onBranchNameChange: (name: string) => void;
}

type PushState = 'idle' | 'pending' | 'success' | 'error';

function GitPanelContainer({
  selectedWorkspace,
  repos,
  repoInfos,
  onBranchNameChange,
}: GitPanelContainerProps) {
  const { executeAction } = useActions();
  const navigate = useNavigate();

  // Track push state per repo: idle, pending, success, or error
  const [pushStates, setPushStates] = useState<Record<string, PushState>>({});
  const pushStatesRef = useRef<Record<string, PushState>>({});
  pushStatesRef.current = pushStates;
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPushRepoRef = useRef<string | null>(null);

  // Reset push-related state when the selected workspace changes to avoid
  // leaking push state across workspaces with repos that share the same ID.
  useEffect(() => {
    setPushStates({});
    pushStatesRef.current = {};
    currentPushRepoRef.current = null;

    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
  }, [selectedWorkspace?.id]);
  // Use push hook for direct API access with proper error handling
  const pushMutation = usePush(
    selectedWorkspace?.id,
    // onSuccess
    () => {
      const repoId = currentPushRepoRef.current;
      if (!repoId) return;
      setPushStates((prev) => ({ ...prev, [repoId]: 'success' }));
      // Clear success state after 2 seconds
      successTimeoutRef.current = setTimeout(() => {
        setPushStates((prev) => ({ ...prev, [repoId]: 'idle' }));
      }, 2000);
    },
    // onError
    async (err, errorData) => {
      const repoId = currentPushRepoRef.current;
      if (!repoId) return;

      // Handle force push required - show confirmation dialog
      if (errorData?.type === 'force_push_required' && selectedWorkspace?.id) {
        setPushStates((prev) => ({ ...prev, [repoId]: 'idle' }));
        await ForcePushDialog.show({
          attemptId: selectedWorkspace.id,
          repoId,
        });
        return;
      }

      // Show error state and dialog for other errors
      setPushStates((prev) => ({ ...prev, [repoId]: 'error' }));
      const message =
        err instanceof Error ? err.message : 'Failed to push changes';
      ConfirmDialog.show({
        title: 'Error',
        message,
        confirmText: 'OK',
        showCancelButton: false,
        variant: 'destructive',
      });
      // Clear error state after 3 seconds
      successTimeoutRef.current = setTimeout(() => {
        setPushStates((prev) => ({ ...prev, [repoId]: 'idle' }));
      }, 3000);
    }
  );

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // Compute repoInfos with push button state
  const repoInfosWithPushButton = useMemo(
    () =>
      repoInfos.map((repo) => {
        const state = pushStates[repo.id] ?? 'idle';
        const hasUnpushedCommits =
          repo.prStatus === 'open' && (repo.remoteCommitsAhead ?? 0) > 0;
        // Show push button if there are unpushed commits OR if we're in a push flow
        // (pending/success/error states keep the button visible for feedback)
        const isInPushFlow = state !== 'idle';
        return {
          ...repo,
          showPushButton: hasUnpushedCommits && !isInPushFlow,
          isPushPending: state === 'pending',
          isPushSuccess: state === 'success',
          isPushError: state === 'error',
        };
      }),
    [repoInfos, pushStates]
  );

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
    }
  }, []);

  // Handle GitPanel actions using the action system
  const handleActionsClick = useCallback(
    async (repoId: string, action: RepoAction) => {
      if (!selectedWorkspace?.id) return;

      // Map RepoAction to Action definitions
      const actionMap = {
        'pull-request': Actions.GitCreatePR,
        merge: Actions.GitMerge,
        rebase: Actions.GitRebase,
        'change-target': Actions.GitChangeTarget,
        push: Actions.GitPush,
      };

      const actionDef = actionMap[action];
      if (!actionDef) return;

      // Execute git action with workspaceId and repoId
      await executeAction(actionDef, selectedWorkspace.id, repoId);
    },
    [selectedWorkspace, executeAction]
  );

  // Handle push button click - use mutation for proper state tracking
  const handlePushClick = useCallback(
    (repoId: string) => {
      // Use ref to check current state to avoid stale closure
      if (pushStatesRef.current[repoId] === 'pending') return;

      // Clear any existing timeout
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }

      // Track which repo we're pushing
      currentPushRepoRef.current = repoId;
      setPushStates((prev) => ({ ...prev, [repoId]: 'pending' }));
      pushMutation.mutate({ repo_id: repoId });
    },
    [pushMutation]
  );

  // Handle opening repository settings
  const handleOpenSettings = useCallback(
    (repoId: string) => {
      navigate(`/settings/repos?repoId=${repoId}`);
    },
    [navigate]
  );

  return (
    <GitPanel
      repos={repoInfosWithPushButton}
      workingBranchName={selectedWorkspace?.branch ?? ''}
      onWorkingBranchNameChange={onBranchNameChange}
      onActionsClick={handleActionsClick}
      onPushClick={handlePushClick}
      onOpenInEditor={handleOpenInEditor}
      onCopyPath={handleCopyPath}
      onOpenSettings={handleOpenSettings}
      onAddRepo={() => console.log('Add repo clicked')}
    />
  );
}

// Fixed UUID for the universal workspace draft (same as in useCreateModeState.ts)
const DRAFT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

export function WorkspacesLayout() {
  const {
    workspace: selectedWorkspace,
    workspaceId: selectedWorkspaceId,
    activeWorkspaces,
    archivedWorkspaces,
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

  // Layout state from store
  const {
    isSidebarVisible,
    isMainPanelVisible,
    isGitPanelVisible,
    isChangesMode,
    isLogsMode,
    isPreviewMode,
    setChangesMode,
    setLogsMode,
    resetForCreateMode,
    setSidebarVisible,
    setMainPanelVisible,
  } = useLayoutStore();

  const [rightMainPanelSize, setRightMainPanelSize] = usePaneSize(
    PERSIST_KEYS.rightMainPanel,
    50
  );
  const isRightMainPanelVisible = useIsRightMainPanelVisible();
  const [showArchive, setShowArchive] = usePersistedExpanded(
    PERSIST_KEYS.workspacesSidebarArchived,
    false
  );

  const defaultLayout = (): Layout => {
    let layout = { 'left-main': 50, 'right-main': 50 };
    if (typeof rightMainPanelSize === 'number') {
      layout = {
        'left-main': 100 - rightMainPanelSize,
        'right-main': rightMainPanelSize,
      };
    }
    return layout;
  };

  const onLayoutChange = (layout: Layout) => {
    if (isRightMainPanelVisible) {
      setRightMainPanelSize(layout['right-main']);
    }
  };

  // === Auto-show Workspaces Guide on first visit ===
  const WORKSPACES_GUIDE_ID = 'workspaces-guide';
  const {
    config,
    updateAndSaveConfig,
    loading: configLoading,
  } = useUserSystem();

  const seenFeatures = useMemo(
    () => config?.showcases?.seen_features ?? [],
    [config?.showcases?.seen_features]
  );

  const hasSeenGuide =
    !configLoading && seenFeatures.includes(WORKSPACES_GUIDE_ID);

  useEffect(() => {
    if (configLoading || hasSeenGuide) return;

    // Mark as seen immediately before showing, so page reload doesn't re-trigger
    void updateAndSaveConfig({
      showcases: { seen_features: [...seenFeatures, WORKSPACES_GUIDE_ID] },
    });

    WorkspacesGuideDialog.show().finally(() => {
      WorkspacesGuideDialog.hide();
    });
  }, [configLoading, hasSeenGuide, seenFeatures, updateAndSaveConfig]);

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

  // Command bar keyboard shortcut (CMD+K) - defined later after isChangesMode
  // See useCommandBarShortcut call below

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

  // Compute aggregate diff stats from real diffs (for WorkspacesMainContainer)
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

        // Compute per-repo diff stats
        const repoDiffs = realDiffs.filter((d) => d.repoId === repo.id);
        const filesChanged = repoDiffs.length;
        const linesAdded = repoDiffs.reduce(
          (sum, d) => sum + (d.additions ?? 0),
          0
        );
        const linesRemoved = repoDiffs.reduce(
          (sum, d) => sum + (d.deletions ?? 0),
          0
        );

        return {
          id: repo.id,
          name: repo.display_name || repo.name,
          targetBranch: repo.target_branch || 'main',
          commitsAhead: repoStatus?.commits_ahead ?? 0,
          remoteCommitsAhead: repoStatus?.remote_commits_ahead ?? 0,
          filesChanged,
          linesAdded,
          linesRemoved,
          prNumber,
          prUrl,
          prStatus,
        };
      }),
    [repos, realDiffs, branchStatus]
  );

  // Content for logs panel (either process logs or tool content)
  const [logsPanelContent, setLogsPanelContent] =
    useState<LogsPanelContent | null>(null);

  // Log search state (lifted from LogsContentContainer)
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logMatchIndices, setLogMatchIndices] = useState<number[]>([]);
  const [logCurrentMatchIdx, setLogCurrentMatchIdx] = useState(0);

  // Reset search when content changes
  const logContentId =
    logsPanelContent?.type === 'process'
      ? logsPanelContent.processId
      : logsPanelContent?.type === 'tool'
        ? logsPanelContent.toolName
        : null;

  useEffect(() => {
    setLogSearchQuery('');
    setLogCurrentMatchIdx(0);
  }, [logContentId]);

  // Reset current match index when search query changes
  useEffect(() => {
    setLogCurrentMatchIdx(0);
  }, [logSearchQuery]);

  // Navigation handlers for log search
  const handleLogPrevMatch = useCallback(() => {
    if (logMatchIndices.length === 0) return;
    setLogCurrentMatchIdx((prev) =>
      prev > 0 ? prev - 1 : logMatchIndices.length - 1
    );
  }, [logMatchIndices.length]);

  const handleLogNextMatch = useCallback(() => {
    if (logMatchIndices.length === 0) return;
    setLogCurrentMatchIdx((prev) =>
      prev < logMatchIndices.length - 1 ? prev + 1 : 0
    );
  }, [logMatchIndices.length]);

  // Reset changes and logs mode when entering create mode
  useEffect(() => {
    if (isCreateMode) {
      resetForCreateMode();
    }
  }, [isCreateMode, resetForCreateMode]);

  // Show sidebar when right main panel is hidden
  useEffect(() => {
    if (!isRightMainPanelVisible) {
      setSidebarVisible(true);
    }
  }, [isRightMainPanelVisible, setSidebarVisible]);

  // Ensure left main panel (chat) is visible when right main panel is hidden
  // This prevents invalid state where only sidebars are visible after page reload
  useEffect(() => {
    if (!isMainPanelVisible && !isRightMainPanelVisible) {
      setMainPanelVisible(true);
    }
  }, [isMainPanelVisible, isRightMainPanelVisible, setMainPanelVisible]);

  // Command bar keyboard shortcut (CMD+K)
  const handleOpenCommandBar = useCallback(() => {
    CommandBarDialog.show();
  }, []);
  useCommandBarShortcut(handleOpenCommandBar);

  // Expanded state for file tree selection
  const { setExpanded } = useExpandedAll();

  // Navigate to logs panel and select a specific process
  const handleViewProcessInPanel = useCallback(
    (processId: string) => {
      if (!isLogsMode) {
        setLogsMode(true);
      }
      setLogsPanelContent({ type: 'process', processId });
    },
    [isLogsMode, setLogsMode]
  );

  // Navigate to logs panel and display static tool content
  const handleViewToolContentInPanel = useCallback(
    (toolName: string, content: string, command?: string) => {
      if (!isLogsMode) {
        setLogsMode(true);
      }
      setLogsPanelContent({ type: 'tool', toolName, content, command });
    },
    [isLogsMode, setLogsMode]
  );

  // Navigate to changes panel and scroll to a specific file
  const handleViewFileInChanges = useCallback(
    (filePath: string) => {
      setChangesMode(true);
      setSelectedFilePath(filePath);
    },
    [setChangesMode]
  );

  // Toggle changes mode for "View Code" button in main panel
  const handleToggleChangesMode = useCallback(() => {
    setChangesMode(!isChangesMode);
  }, [isChangesMode, setChangesMode]);

  // Compute diffPaths for FileNavigationContext
  const diffPaths = useMemo(() => {
    return new Set(
      realDiffs.map((d) => d.newPath || d.oldPath || '').filter(Boolean)
    );
  }, [realDiffs]);

  // Sync diffPaths to store for actions (ToggleAllDiffs, ExpandAllDiffs, etc.)
  useEffect(() => {
    useDiffViewStore.getState().setDiffPaths(Array.from(diffPaths));
    return () => useDiffViewStore.getState().setDiffPaths([]);
  }, [diffPaths]);

  // Get the most recent workspace to auto-select its project and repos in create mode
  // Fall back to archived workspaces if no active workspaces exist
  const mostRecentWorkspace = activeWorkspaces[0] ?? archivedWorkspaces[0];

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

  // Render right panel content based on current mode
  const renderRightPanelContent = () => {
    if (isCreateMode) {
      return <GitPanelCreateContainer />;
    }

    if (isChangesMode) {
      // In changes mode, split git panel vertically: file tree on top, git on bottom
      return (
        <div className="flex flex-col h-full">
          <div className="flex-[7] min-h-0 overflow-hidden">
            <FileTreeContainer
              key={selectedWorkspace?.id}
              workspaceId={selectedWorkspace?.id}
              diffs={realDiffs}
              selectedFilePath={fileInView}
              onSelectFile={(path) => {
                setSelectedFilePath(path);
                setFileInView(path);
                // Expand the diff if it was collapsed
                setExpanded(`diff:${path}`, true);
              }}
            />
          </div>
          <div className="flex-[3] min-h-0 overflow-hidden">
            <GitPanelContainer
              selectedWorkspace={selectedWorkspace}
              repos={repos}
              repoInfos={repoInfos}
              onBranchNameChange={handleBranchNameChange}
            />
          </div>
        </div>
      );
    }

    if (isLogsMode) {
      // In logs mode, split git panel vertically: process list on top, git on bottom
      // Derive selectedProcessId from logsPanelContent if it's a process
      const selectedProcessId =
        logsPanelContent?.type === 'process'
          ? logsPanelContent.processId
          : null;
      return (
        <div className="flex flex-col h-full">
          <div className="flex-[7] min-h-0 overflow-hidden">
            <ProcessListContainer
              selectedProcessId={selectedProcessId}
              onSelectProcess={handleViewProcessInPanel}
              disableAutoSelect={logsPanelContent?.type === 'tool'}
              searchQuery={logSearchQuery}
              onSearchQueryChange={setLogSearchQuery}
              matchCount={logMatchIndices.length}
              currentMatchIdx={logCurrentMatchIdx}
              onPrevMatch={handleLogPrevMatch}
              onNextMatch={handleLogNextMatch}
            />
          </div>
          <div className="flex-[3] min-h-0 overflow-hidden">
            <GitPanelContainer
              selectedWorkspace={selectedWorkspace}
              repos={repos}
              repoInfos={repoInfos}
              onBranchNameChange={handleBranchNameChange}
            />
          </div>
        </div>
      );
    }

    if (isPreviewMode) {
      // In preview mode, split git panel vertically: preview controls on top, git on bottom
      return (
        <div className="flex flex-col h-full">
          <div className="flex-[7] min-h-0 overflow-hidden">
            <PreviewControlsContainer
              attemptId={selectedWorkspace?.id}
              onViewProcessInPanel={handleViewProcessInPanel}
            />
          </div>
          <div className="flex-[3] min-h-0 overflow-hidden">
            <GitPanelContainer
              selectedWorkspace={selectedWorkspace}
              repos={repos}
              repoInfos={repoInfos}
              onBranchNameChange={handleBranchNameChange}
            />
          </div>
        </div>
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

  // Action handlers for sidebar workspace actions
  const { executeAction } = useActions();

  const handleArchiveWorkspace = useCallback(
    (workspaceId: string) => {
      executeAction(Actions.ArchiveWorkspace, workspaceId);
    },
    [executeAction]
  );

  const handlePinWorkspace = useCallback(
    (workspaceId: string) => {
      executeAction(Actions.PinWorkspace, workspaceId);
    },
    [executeAction]
  );

  // Render sidebar with persisted draft title
  const renderSidebar = () => (
    <WorkspacesSidebar
      workspaces={activeWorkspaces}
      archivedWorkspaces={archivedWorkspaces}
      selectedWorkspaceId={selectedWorkspaceId ?? null}
      onSelectWorkspace={selectWorkspace}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddWorkspace={navigateToCreate}
      onArchiveWorkspace={handleArchiveWorkspace}
      onPinWorkspace={handlePinWorkspace}
      isCreateMode={isCreateMode}
      draftTitle={persistedDraftTitle}
      onSelectCreate={navigateToCreate}
      showArchive={showArchive}
      onShowArchiveChange={setShowArchive}
    />
  );

  // Render layout content (create mode or workspace mode)
  const renderContent = () => {
    // Main panel content
    const mainPanelContent = isCreateMode ? (
      <CreateChatBoxContainer />
    ) : (
      <FileNavigationProvider
        viewFileInChanges={handleViewFileInChanges}
        diffPaths={diffPaths}
      >
        <LogNavigationProvider
          viewProcessInPanel={handleViewProcessInPanel}
          viewToolContentInPanel={handleViewToolContentInPanel}
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
        </LogNavigationProvider>
      </FileNavigationProvider>
    );

    // Right main panel content (Changes/Logs/Preview)
    const rightMainPanelContent = (
      <>
        {isChangesMode && (
          <ChangesPanelContainer
            diffs={realDiffs}
            selectedFilePath={selectedFilePath}
            onFileInViewChange={setFileInView}
            projectId={selectedWorkspaceTask?.project_id}
            attemptId={selectedWorkspace?.id}
          />
        )}
        {isLogsMode && (
          <LogsContentContainer
            content={logsPanelContent}
            searchQuery={logSearchQuery}
            currentMatchIndex={logCurrentMatchIdx}
            onMatchIndicesChange={setLogMatchIndices}
          />
        )}
        {isPreviewMode && (
          <PreviewBrowserContainer attemptId={selectedWorkspace?.id} />
        )}
      </>
    );

    // Inner layout with main, changes/logs, git panel
    const innerLayout = (
      <div className="flex h-full">
        {/* Resizable area for main + right panels */}
        <Group
          orientation="horizontal"
          className="flex-1 min-w-0 h-full"
          defaultLayout={defaultLayout()}
          onLayoutChange={onLayoutChange}
        >
          {/* Main panel (chat area) */}
          {isMainPanelVisible && (
            <Panel
              id="left-main"
              minSize={20}
              className="min-w-0 h-full overflow-hidden"
            >
              {mainPanelContent}
            </Panel>
          )}

          {/* Resize handle between main and right panels */}
          {isMainPanelVisible && isRightMainPanelVisible && (
            <Separator
              id="main-separator"
              className="w-1 bg-transparent hover:bg-brand/50 transition-colors cursor-col-resize"
            />
          )}

          {/* Right main panel (Changes/Logs/Preview) */}
          {isRightMainPanelVisible && (
            <Panel
              id="right-main"
              minSize={20}
              className="min-w-0 h-full overflow-hidden"
            >
              {rightMainPanelContent}
            </Panel>
          )}
        </Group>

        {/* Git panel (right sidebar) - fixed width, not resizable */}
        {isGitPanelVisible && (
          <div className="w-[300px] shrink-0 h-full overflow-hidden">
            {renderRightPanelContent()}
          </div>
        )}
      </div>
    );

    // Wrap inner layout with providers
    const wrappedInnerContent = isCreateMode ? (
      <CreateModeProvider
        initialProjectId={lastWorkspaceTask?.project_id}
        initialRepos={lastWorkspaceRepos}
      >
        <ReviewProvider attemptId={selectedWorkspace?.id}>
          {innerLayout}
        </ReviewProvider>
      </CreateModeProvider>
    ) : (
      <ExecutionProcessesProvider
        key={`${selectedWorkspace?.id}-${selectedSessionId}`}
        attemptId={selectedWorkspace?.id}
        sessionId={selectedSessionId}
      >
        <ReviewProvider attemptId={selectedWorkspace?.id}>
          {innerLayout}
        </ReviewProvider>
      </ExecutionProcessesProvider>
    );

    return (
      <div className="flex flex-1 min-h-0">
        {/* Sidebar - OUTSIDE providers, won't remount on workspace switch */}
        {isSidebarVisible && (
          <div className="w-[300px] shrink-0 h-full overflow-hidden">
            {renderSidebar()}
          </div>
        )}

        {/* Container for provider-wrapped inner content */}
        <div className="flex-1 min-w-0 h-full">{wrappedInnerContent}</div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen">
      <NavbarContainer />
      {renderContent()}
    </div>
  );
}
