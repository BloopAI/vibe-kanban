import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Allotment, LayoutPriority } from 'allotment';
import 'allotment/dist/style.css';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { CreateModeProvider } from '@/contexts/CreateModeContext';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';
import { WorkspacesMainContainer } from '@/components/ui-new/containers/WorkspacesMainContainer';
import { GitPanel, type RepoInfo } from '@/components/ui-new/views/GitPanel';
import { FileTreeContainer } from '@/components/ui-new/containers/FileTreeContainer';
import { ChangesPanelContainer } from '@/components/ui-new/containers/ChangesPanelContainer';
import { GitPanelCreateContainer } from '@/components/ui-new/containers/GitPanelCreateContainer';
import { CreateChatBoxContainer } from '@/components/ui-new/containers/CreateChatBoxContainer';
import { Navbar } from '@/components/ui-new/views/Navbar';
import { useRenameBranch } from '@/hooks/useRenameBranch';
import { attemptsApi } from '@/lib/api';
import { attemptKeys } from '@/hooks/useAttempt';
import { useRepoBranches } from '@/hooks';
import { useTask } from '@/hooks/useTask';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useMerge } from '@/hooks/useMerge';
import { usePaneSize, PERSIST_KEYS } from '@/stores/useUiPreferencesStore';
import { ChangeTargetDialog } from '@/components/ui-new/dialogs/ChangeTargetDialog';
import { RebaseDialog } from '@/components/ui-new/dialogs/RebaseDialog';
import { ConfirmDialog } from '@/components/ui-new/dialogs/ConfirmDialog';
import { CreatePRDialog } from '@/components/dialogs/tasks/CreatePRDialog';
import type { RepoAction } from '@/components/ui-new/primitives/RepoCard';
import type { Workspace, RepoWithTargetBranch, Diff } from 'shared/types';

// Mock diffs for development - shared between FileTree and ChangesPanel
const MOCK_DIFFS: Diff[] = [
  {
    change: 'modified',
    oldPath: 'src/components/App.tsx',
    newPath: 'src/components/App.tsx',
    oldContent:
      '// Old App content\nexport function App() {\n  return <div>Hello</div>;\n}',
    newContent:
      '// New App content\nexport function App() {\n  return <div>Hello World!</div>;\n}',
    contentOmitted: false,
    additions: 15,
    deletions: 3,
  },
  {
    change: 'added',
    oldPath: null,
    newPath: 'src/components/ui-new/views/FileTree.tsx',
    oldContent: null,
    newContent:
      '// FileTree component\nexport function FileTree() {\n  return <div>Tree</div>;\n}',
    contentOmitted: false,
    additions: 120,
    deletions: null,
  },
  {
    change: 'added',
    oldPath: null,
    newPath: 'src/components/ui-new/views/FileTreeNode.tsx',
    oldContent: null,
    newContent:
      '// FileTreeNode component\nexport function FileTreeNode() {\n  return <div>Node</div>;\n}',
    contentOmitted: false,
    additions: 95,
    deletions: null,
  },
  {
    change: 'deleted',
    oldPath: 'src/utils/oldHelper.ts',
    newPath: null,
    oldContent: '// Old helper\nexport function helper() {}',
    newContent: null,
    contentOmitted: false,
    additions: null,
    deletions: 45,
  },
  {
    change: 'modified',
    oldPath: 'src/styles/new/index.css',
    newPath: 'src/styles/new/index.css',
    oldContent: '/* Old styles */\n.container { padding: 10px; }',
    newContent:
      '/* New styles */\n.container { padding: 20px; }\n.header { color: blue; }',
    contentOmitted: false,
    additions: 8,
    deletions: 2,
  },
  {
    change: 'renamed',
    oldPath: 'src/utils/helper.ts',
    newPath: 'src/utils/fileHelper.ts',
    oldContent: '// Helper functions',
    newContent: '// File helper functions',
    contentOmitted: false,
    additions: 0,
    deletions: 0,
  },
  {
    change: 'modified',
    oldPath: 'package.json',
    newPath: 'package.json',
    oldContent: '{\n  "name": "app",\n  "version": "1.0.0"\n}',
    newContent:
      '{\n  "name": "app",\n  "version": "1.0.1",\n  "description": "My app"\n}',
    contentOmitted: false,
    additions: 2,
    deletions: 1,
  },
];

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
      onAddRepo={() => console.log('Add repo clicked')}
      error={error}
    />
  );
}

export function WorkspacesLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  // Selected file path for scroll-to in changes mode
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // Fetch task for current workspace (used for old UI navigation)
  const { data: selectedWorkspaceTask } = useTask(selectedWorkspace?.task_id, {
    enabled: !!selectedWorkspace?.task_id,
  });

  // Archive/unarchive mutation
  const toggleArchiveMutation = useMutation({
    mutationFn: ({
      workspaceId,
      archived,
    }: {
      workspaceId: string;
      archived: boolean;
      nextWorkspaceId: string | null;
    }) => attemptsApi.update(workspaceId, { archived: !archived }),
    onSuccess: (_, { workspaceId, archived, nextWorkspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: attemptKeys.byId(workspaceId),
      });

      // When archiving, navigate to the next workspace
      if (!archived && nextWorkspaceId) {
        selectWorkspace(nextWorkspaceId);
      }
    },
  });

  // Hook to rename branch via API
  const renameBranch = useRenameBranch(selectedWorkspace?.id);

  const handleBranchNameChange = useCallback(
    (newName: string) => {
      renameBranch.mutate(newName);
    },
    [renameBranch]
  );

  // Transform repos to RepoInfo format for GitPanel
  const repoInfos: RepoInfo[] = useMemo(
    () =>
      repos.map((repo) => ({
        id: repo.id,
        name: repo.display_name || repo.name,
        targetBranch: repo.target_branch || 'main',
        commitsAhead: 0, // Mock for now
        filesChanged: 0, // Mock for now
        linesAdded: 0, // Mock for now
        linesRemoved: 0, // Mock for now
      })),
    [repos]
  );

  // Visibility state for sidebar panels
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isGitPanelVisible, setIsGitPanelVisible] = useState(true);
  const [isChangesMode, setIsChangesMode] = useState(false);

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
      // sizes[0] = sidebar, sizes[1] = main, sizes[2] = git panel, sizes[3] = changes panel (if visible)
      if (sizes[0] !== undefined) setSidebarWidth(sizes[0]);
      if (sizes[2] !== undefined) setGitPanelWidth(sizes[2]);
      if (sizes[3] !== undefined) setChangesPanelWidth(sizes[3]);
    },
    [setSidebarWidth, setGitPanelWidth, setChangesPanelWidth]
  );

  // Panel toggle handlers
  const handleToggleSidebar = useCallback(() => {
    if (!isChangesMode) {
      setIsSidebarVisible((prev) => !prev);
    }
  }, [isChangesMode]);

  const handleToggleGitPanel = useCallback(() => {
    setIsGitPanelVisible((prev) => !prev);
  }, []);

  const handleToggleChangesMode = useCallback(() => {
    setIsChangesMode((prev) => !prev);
  }, []);

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
              diffs={MOCK_DIFFS}
              onSelectFile={(path) => setSelectedFilePath(path)}
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

  // Render layout content (create mode or workspace mode)
  const renderContent = () => {
    const content = (
      <Allotment className="flex-1 min-h-0" onDragEnd={handlePaneResize}>
        <Allotment.Pane
          minSize={300}
          preferredSize={sidebarWidth}
          maxSize={600}
          visible={isSidebarVisible && !isChangesMode}
        >
          <div className="h-full overflow-hidden">
            <WorkspacesSidebar
              workspaces={sidebarWorkspaces}
              archivedWorkspaces={archivedSidebarWorkspaces}
              selectedWorkspaceId={selectedWorkspaceId ?? null}
              onSelectWorkspace={selectWorkspace}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onAddWorkspace={navigateToCreate}
            />
          </div>
        </Allotment.Pane>

        <Allotment.Pane
          visible={true}
          priority={LayoutPriority.High}
          minSize={300}
        >
          <div className="h-full overflow-hidden">
            {isCreateMode ? (
              <CreateChatBoxContainer />
            ) : (
              <ExecutionProcessesProvider
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
                />
              </ExecutionProcessesProvider>
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
            {renderGitPanelContent()}
          </div>
        </Allotment.Pane>

        <Allotment.Pane
          minSize={300}
          preferredSize={changesPanelWidth}
          visible={isChangesMode}
        >
          <div className="h-full overflow-hidden">
            <ChangesPanelContainer
              diffs={MOCK_DIFFS}
              selectedFilePath={selectedFilePath}
            />
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
        isGitPanelVisible={isGitPanelVisible}
        isChangesMode={isChangesMode}
        isCreateMode={isCreateMode}
        isArchived={selectedWorkspace?.archived}
        onToggleSidebar={handleToggleSidebar}
        onToggleGitPanel={handleToggleGitPanel}
        onToggleChangesMode={handleToggleChangesMode}
        onToggleArchive={selectedWorkspace ? handleToggleArchive : undefined}
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
