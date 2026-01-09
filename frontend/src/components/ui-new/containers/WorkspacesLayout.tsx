import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Allotment, LayoutPriority, type AllotmentHandle } from 'allotment';
import 'allotment/dist/style.css';
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
import { repoApi } from '@/lib/api';
import { useDiffStream } from '@/hooks/useDiffStream';
import { useTask } from '@/hooks/useTask';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import {
  usePaneSize,
  useExpandedAll,
  PERSIST_KEYS,
} from '@/stores/useUiPreferencesStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useDiffViewStore } from '@/stores/useDiffViewStore';
import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';
import { useCommandBarShortcut } from '@/hooks/useCommandBarShortcut';
import { Actions } from '@/components/ui-new/actions';
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
  const { executeAction } = useActions();

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
      };

      const actionDef = actionMap[action];
      if (!actionDef) return;

      // Execute git action with workspaceId and repoId
      await executeAction(actionDef, selectedWorkspace.id, repoId);
    },
    [selectedWorkspace, executeAction]
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
  } = useLayoutStore();

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

  // Ref to Allotment for programmatic control
  const allotmentRef = useRef<AllotmentHandle>(null);

  // Reset Allotment sizes when changes, logs, or preview panel becomes visible
  // This re-applies preferredSize percentages based on current window size
  useEffect(() => {
    if (
      (isChangesMode || isLogsMode || isPreviewMode) &&
      allotmentRef.current
    ) {
      allotmentRef.current.reset();
    }
  }, [isChangesMode, isLogsMode, isPreviewMode]);

  // Reset changes and logs mode when entering create mode
  useEffect(() => {
    if (isCreateMode) {
      resetForCreateMode();
    }
  }, [isCreateMode, resetForCreateMode]);

  // Command bar keyboard shortcut (CMD+K)
  const handleOpenCommandBar = useCallback(() => {
    CommandBarDialog.show();
  }, []);
  useCommandBarShortcut(handleOpenCommandBar);

  // Expanded state for file tree selection
  const { setExpanded } = useExpandedAll();

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
      // sizes[0] = sidebar, sizes[1] = main, sizes[2] = changes/logs panel, sizes[3] = git panel
      if (sizes[0] !== undefined) setSidebarWidth(sizes[0]);
      if (sizes[3] !== undefined) setGitPanelWidth(sizes[3]);

      const total = sizes.reduce((sum, s) => sum + (s ?? 0), 0);
      if (total > 0) {
        // Store changes/logs panel as percentage of TOTAL container width
        const centerPaneWidth = sizes[2];
        if (centerPaneWidth !== undefined) {
          const percent = Math.round((centerPaneWidth / total) * 100);
          setChangesPanelWidth(`${percent}%`);
        }
      }
    },
    [setSidebarWidth, setGitPanelWidth, setChangesPanelWidth]
  );

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
                // Expand the diff if it was collapsed
                setExpanded(`diff:${path}`, true);
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

    if (isLogsMode) {
      // In logs mode, split git panel vertically: process list on top, git on bottom
      // Derive selectedProcessId from logsPanelContent if it's a process
      const selectedProcessId =
        logsPanelContent?.type === 'process'
          ? logsPanelContent.processId
          : null;
      return (
        <Allotment vertical onDragEnd={handleFileTreeResize} proportionalLayout>
          <Allotment.Pane minSize={200} preferredSize={fileTreeHeight}>
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

    if (isPreviewMode) {
      // In preview mode, split git panel vertically: preview controls on top, git on bottom
      return (
        <Allotment vertical onDragEnd={handleFileTreeResize} proportionalLayout>
          <Allotment.Pane minSize={200} preferredSize={fileTreeHeight}>
            <PreviewControlsContainer
              attemptId={selectedWorkspace?.id}
              onViewProcessInPanel={handleViewProcessInPanel}
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
      workspaces={activeWorkspaces}
      archivedWorkspaces={archivedWorkspaces}
      selectedWorkspaceId={selectedWorkspaceId ?? null}
      onSelectWorkspace={selectWorkspace}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddWorkspace={navigateToCreate}
      isCreateMode={isCreateMode}
      draftTitle={persistedDraftTitle}
      onSelectCreate={navigateToCreate}
    />
  );

  // Render layout content (create mode or workspace mode)
  const renderContent = () => {
    const allotmentContent = (
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
            )}
          </div>
        </Allotment.Pane>

        <Allotment.Pane
          minSize={300}
          preferredSize={changesPanelWidth}
          visible={isChangesMode || isLogsMode || isPreviewMode}
        >
          <div className="h-full overflow-hidden">
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
          </div>
        </Allotment.Pane>

        <Allotment.Pane
          minSize={300}
          preferredSize={gitPanelWidth}
          maxSize={600}
          visible={isGitPanelVisible}
        >
          <div className="h-full overflow-hidden">
            {renderRightPanelContent()}
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
          <ReviewProvider attemptId={selectedWorkspace?.id}>
            {allotmentContent}
          </ReviewProvider>
        </CreateModeProvider>
      );
    }

    return (
      <ExecutionProcessesProvider
        key={`${selectedWorkspace?.id}-${selectedSessionId}`}
        attemptId={selectedWorkspace?.id}
        sessionId={selectedSessionId}
      >
        <ReviewProvider attemptId={selectedWorkspace?.id}>
          {allotmentContent}
        </ReviewProvider>
      </ExecutionProcessesProvider>
    );
  };

  return (
    <div className="flex flex-col h-screen">
      <NavbarContainer />
      {renderContent()}
    </div>
  );
}
