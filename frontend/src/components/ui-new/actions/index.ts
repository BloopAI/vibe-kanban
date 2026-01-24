import { forwardRef, createElement } from 'react';
import type { Icon, IconProps } from '@phosphor-icons/react';
import type { NavigateFunction } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';
import type { EditorType, ExecutionProcess, Workspace } from 'shared/types';
import type { DiffViewMode } from '@/stores/useDiffViewStore';
import type { LogsPanelContent } from '../containers/LogsContentContainer';
import type { LogEntry } from '../containers/VirtualizedProcessLogs';
import {
  CopyIcon,
  PushPinIcon,
  ArchiveIcon,
  TrashIcon,
  PlusIcon,
  GearIcon,
  ColumnsIcon,
  RowsIcon,
  TextAlignLeftIcon,
  EyeSlashIcon,
  SidebarSimpleIcon,
  ChatsTeardropIcon,
  GitDiffIcon,
  TerminalIcon,
  SignOutIcon,
  CaretDoubleUpIcon,
  CaretDoubleDownIcon,
  PlayIcon,
  PauseIcon,
  SpinnerIcon,
  GitPullRequestIcon,
  GitMergeIcon,
  GitForkIcon,
  ArrowsClockwiseIcon,
  CrosshairIcon,
  DesktopIcon,
  PencilSimpleIcon,
  ArrowUpIcon,
  HighlighterIcon,
  ListIcon,
  MegaphoneIcon,
  QuestionIcon,
} from '@phosphor-icons/react';
import { useDiffViewStore } from '@/stores/useDiffViewStore';
import {
  useUiPreferencesStore,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';

import { attemptsApi, tasksApi, repoApi } from '@/lib/api';
import { attemptKeys } from '@/hooks/useAttempt';
import { taskKeys } from '@/hooks/useTask';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import { ConfirmDialog } from '@/components/ui-new/dialogs/ConfirmDialog';
import { ChangeTargetDialog } from '@/components/ui-new/dialogs/ChangeTargetDialog';
import { RebaseDialog } from '@/components/ui-new/dialogs/RebaseDialog';
import { ResolveConflictsDialog } from '@/components/ui-new/dialogs/ResolveConflictsDialog';
import { RenameWorkspaceDialog } from '@/components/ui-new/dialogs/RenameWorkspaceDialog';
import { CreatePRDialog } from '@/components/dialogs/tasks/CreatePRDialog';
import { getIdeName } from '@/components/ide/IdeIcon';
import { EditorSelectionDialog } from '@/components/dialogs/tasks/EditorSelectionDialog';
import { StartReviewDialog } from '@/components/dialogs/tasks/StartReviewDialog';
import posthog from 'posthog-js';
import { WorkspacesGuideDialog } from '@/components/ui-new/dialogs/WorkspacesGuideDialog';
import { SettingsDialog } from '@/components/ui-new/dialogs/SettingsDialog';

// Mirrored sidebar icon for right sidebar toggle
const RightSidebarIcon: Icon = forwardRef<SVGSVGElement, IconProps>(
  (props, ref) =>
    createElement(SidebarSimpleIcon, {
      ref,
      ...props,
      style: { transform: 'scaleX(-1)', ...props.style },
    })
);
RightSidebarIcon.displayName = 'RightSidebarIcon';

// Special icon types for ContextBar
export type SpecialIconType = 'ide-icon' | 'copy-icon';
export type ActionIcon = Icon | SpecialIconType;

// Workspace type for sidebar (minimal subset needed for workspace selection)
interface SidebarWorkspace {
  id: string;
}

// Dev server state type for visibility context
export type DevServerState = 'stopped' | 'starting' | 'running' | 'stopping';

// Context provided to action executors (from React hooks)
export interface ActionExecutorContext {
  navigate: NavigateFunction;
  queryClient: QueryClient;
  selectWorkspace: (workspaceId: string) => void;
  activeWorkspaces: SidebarWorkspace[];
  currentWorkspaceId: string | null;
  containerRef: string | null;
  runningDevServers: ExecutionProcess[];
  startDevServer: () => void;
  stopDevServer: () => void;
  // Logs panel state
  currentLogs: LogEntry[] | null;
  logsPanelContent: LogsPanelContent | null;
}

// Context for evaluating action visibility and state conditions
export interface ActionVisibilityContext {
  // Layout state
  rightMainPanelMode:
    | (typeof RIGHT_MAIN_PANEL_MODES)[keyof typeof RIGHT_MAIN_PANEL_MODES]
    | null;
  isLeftSidebarVisible: boolean;
  isLeftMainPanelVisible: boolean;
  isRightSidebarVisible: boolean;
  isCreateMode: boolean;

  // Workspace state
  hasWorkspace: boolean;
  workspaceArchived: boolean;

  // Diff state
  hasDiffs: boolean;
  diffViewMode: DiffViewMode;
  isAllDiffsExpanded: boolean;

  // Dev server state
  editorType: EditorType | null;
  devServerState: DevServerState;
  runningDevServers: ExecutionProcess[];

  // Git panel state
  hasGitRepos: boolean;
  hasMultipleRepos: boolean;
  hasOpenPR: boolean;
  hasUnpushedCommits: boolean;

  // Execution state
  isAttemptRunning: boolean;

  // Logs panel state
  logsPanelContent: LogsPanelContent | null;
}

// Base properties shared by all actions
interface ActionBase {
  id: string;
  label: string | ((workspace?: Workspace) => string);
  icon: ActionIcon;
  shortcut?: string;
  variant?: 'default' | 'destructive';
  // Optional visibility condition - if omitted, action is always visible
  isVisible?: (ctx: ActionVisibilityContext) => boolean;
  // Optional active state - if omitted, action is not active
  isActive?: (ctx: ActionVisibilityContext) => boolean;
  // Optional enabled state - if omitted, action is enabled
  isEnabled?: (ctx: ActionVisibilityContext) => boolean;
  // Optional dynamic icon - if omitted, uses static icon property
  getIcon?: (ctx: ActionVisibilityContext) => ActionIcon;
  // Optional dynamic tooltip - if omitted, uses label
  getTooltip?: (ctx: ActionVisibilityContext) => string;
  // Optional dynamic label - if omitted, uses static label property
  getLabel?: (ctx: ActionVisibilityContext) => string;
}

// Global action (no target needed)
export interface GlobalActionDefinition extends ActionBase {
  requiresTarget: false;
  execute: (ctx: ActionExecutorContext) => Promise<void> | void;
}

// Workspace action (target required - validated by ActionsContext)
export interface WorkspaceActionDefinition extends ActionBase {
  requiresTarget: true;
  execute: (
    ctx: ActionExecutorContext,
    workspaceId: string
  ) => Promise<void> | void;
}

// Git action (requires workspace + repoId)
export interface GitActionDefinition extends ActionBase {
  requiresTarget: 'git';
  execute: (
    ctx: ActionExecutorContext,
    workspaceId: string,
    repoId: string
  ) => Promise<void> | void;
}

// Discriminated union
export type ActionDefinition =
  | GlobalActionDefinition
  | WorkspaceActionDefinition
  | GitActionDefinition;

// Helper to get workspace from query cache or fetch from API
async function getWorkspace(
  queryClient: QueryClient,
  workspaceId: string
): Promise<Workspace> {
  const cached = queryClient.getQueryData<Workspace>(
    attemptKeys.byId(workspaceId)
  );
  if (cached) {
    return cached;
  }
  // Fetch from API if not in cache
  return attemptsApi.get(workspaceId);
}

// Helper to invalidate workspace-related queries
function invalidateWorkspaceQueries(
  queryClient: QueryClient,
  workspaceId: string
) {
  queryClient.invalidateQueries({ queryKey: attemptKeys.byId(workspaceId) });
  queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
}

// Helper to find the next workspace to navigate to when removing current workspace
function getNextWorkspaceId(
  activeWorkspaces: SidebarWorkspace[],
  removingWorkspaceId: string
): string | null {
  const currentIndex = activeWorkspaces.findIndex(
    (ws) => ws.id === removingWorkspaceId
  );
  if (currentIndex >= 0 && activeWorkspaces.length > 1) {
    const nextWorkspace =
      activeWorkspaces[currentIndex + 1] || activeWorkspaces[currentIndex - 1];
    return nextWorkspace?.id ?? null;
  }
  return null;
}

// All application actions
export const Actions = {
  // === Workspace Actions ===
  DuplicateWorkspace: {
    id: 'duplicate-workspace',
    label: 'Duplicate',
    icon: CopyIcon,
    shortcut: 'W D',
    requiresTarget: true,
    execute: async (ctx, workspaceId) => {
      try {
        const [workspace, firstMessage, repos] = await Promise.all([
          getWorkspace(ctx.queryClient, workspaceId),
          attemptsApi.getFirstUserMessage(workspaceId),
          attemptsApi.getRepos(workspaceId),
        ]);
        const task = await tasksApi.getById(workspace.task_id);
        ctx.navigate('/workspaces/create', {
          state: {
            initialPrompt: firstMessage,
            preferredRepos: repos.map((r) => ({
              repo_id: r.id,
              target_branch: r.target_branch,
            })),
            project_id: task.project_id,
          },
        });
      } catch {
        // Fallback to creating without the prompt/repos
        ctx.navigate('/workspaces/create');
      }
    },
  },

  RenameWorkspace: {
    id: 'rename-workspace',
    label: 'Rename',
    icon: PencilSimpleIcon,
    shortcut: 'W R',
    requiresTarget: true,
    execute: async (ctx, workspaceId) => {
      const workspace = await getWorkspace(ctx.queryClient, workspaceId);
      await RenameWorkspaceDialog.show({
        workspaceId,
        currentName: workspace.name || workspace.branch,
      });
    },
  },

  PinWorkspace: {
    id: 'pin-workspace',
    label: (workspace?: Workspace) => (workspace?.pinned ? 'Unpin' : 'Pin'),
    icon: PushPinIcon,
    shortcut: 'W P',
    requiresTarget: true,
    execute: async (ctx, workspaceId) => {
      const workspace = await getWorkspace(ctx.queryClient, workspaceId);
      await attemptsApi.update(workspaceId, {
        pinned: !workspace.pinned,
      });
      invalidateWorkspaceQueries(ctx.queryClient, workspaceId);
    },
  },

  ArchiveWorkspace: {
    id: 'archive-workspace',
    label: (workspace?: Workspace) =>
      workspace?.archived ? 'Unarchive' : 'Archive',
    icon: ArchiveIcon,
    shortcut: 'W A',
    requiresTarget: true,
    isVisible: (ctx) => ctx.hasWorkspace,
    isActive: (ctx) => ctx.workspaceArchived,
    execute: async (ctx, workspaceId) => {
      const workspace = await getWorkspace(ctx.queryClient, workspaceId);
      const wasArchived = workspace.archived;

      // Calculate next workspace before archiving
      const nextWorkspaceId = !wasArchived
        ? getNextWorkspaceId(ctx.activeWorkspaces, workspaceId)
        : null;

      // Perform the archive/unarchive
      await attemptsApi.update(workspaceId, { archived: !wasArchived });
      invalidateWorkspaceQueries(ctx.queryClient, workspaceId);

      // Select next workspace after successful archive
      if (!wasArchived && nextWorkspaceId) {
        ctx.selectWorkspace(nextWorkspaceId);
      }
    },
  },

  DeleteWorkspace: {
    id: 'delete-workspace',
    label: 'Delete',
    icon: TrashIcon,
    shortcut: 'W X',
    variant: 'destructive',
    requiresTarget: true,
    execute: async (ctx, workspaceId) => {
      const workspace = await getWorkspace(ctx.queryClient, workspaceId);
      const result = await ConfirmDialog.show({
        title: 'Delete Workspace',
        message:
          'Are you sure you want to delete this workspace? This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'destructive',
      });
      if (result === 'confirmed') {
        // Calculate next workspace before deleting (only if deleting current)
        const isCurrentWorkspace = ctx.currentWorkspaceId === workspaceId;
        const nextWorkspaceId = isCurrentWorkspace
          ? getNextWorkspaceId(ctx.activeWorkspaces, workspaceId)
          : null;

        await tasksApi.delete(workspace.task_id);
        ctx.queryClient.invalidateQueries({ queryKey: taskKeys.all });
        ctx.queryClient.invalidateQueries({
          queryKey: workspaceSummaryKeys.all,
        });

        // Navigate away if we deleted the current workspace
        if (isCurrentWorkspace) {
          if (nextWorkspaceId) {
            ctx.selectWorkspace(nextWorkspaceId);
          } else {
            ctx.navigate('/workspaces/create');
          }
        }
      }
    },
  },

  StartReview: {
    id: 'start-review',
    label: 'Start Review',
    icon: HighlighterIcon,
    requiresTarget: true,
    isVisible: (ctx) => ctx.hasWorkspace,
    getTooltip: () => 'Review changes with agent',
    execute: async (_ctx, workspaceId) => {
      await StartReviewDialog.show({
        workspaceId,
      });
    },
  },

  SpinOffWorkspace: {
    id: 'spin-off-workspace',
    label: 'Spin off workspace',
    icon: GitForkIcon,
    requiresTarget: true,
    isVisible: (ctx) => ctx.hasWorkspace,
    execute: async (ctx, workspaceId) => {
      try {
        const [workspace, repos] = await Promise.all([
          getWorkspace(ctx.queryClient, workspaceId),
          attemptsApi.getRepos(workspaceId),
        ]);
        const task = await tasksApi.getById(workspace.task_id);
        ctx.navigate('/workspaces/create', {
          state: {
            preferredRepos: repos.map((r) => ({
              repo_id: r.id,
              target_branch: workspace.branch,
            })),
            project_id: task.project_id,
          },
        });
      } catch {
        ctx.navigate('/workspaces/create');
      }
    },
  },

  // === Global/Navigation Actions ===
  NewWorkspace: {
    id: 'new-workspace',
    label: 'New Workspace',
    icon: PlusIcon,
    shortcut: 'G N',
    requiresTarget: false,
    execute: (ctx) => {
      ctx.navigate('/workspaces/create');
    },
  },

  Settings: {
    id: 'settings',
    label: 'Settings',
    icon: GearIcon,
    shortcut: 'G S',
    requiresTarget: false,
    execute: async () => {
      await SettingsDialog.show();
    },
  },

  Feedback: {
    id: 'feedback',
    label: 'Give Feedback',
    icon: MegaphoneIcon,
    requiresTarget: false,
    execute: () => {
      posthog.displaySurvey('019bb6e8-3d36-0000-1806-7330cd3c727e');
    },
  },

  WorkspacesGuide: {
    id: 'workspaces-guide',
    label: 'Workspaces Guide',
    icon: QuestionIcon,
    requiresTarget: false,
    execute: async () => {
      await WorkspacesGuideDialog.show();
    },
  },

  OpenCommandBar: {
    id: 'open-command-bar',
    label: 'Open Command Bar',
    icon: ListIcon,
    shortcut: '{mod} K',
    requiresTarget: false,
    execute: async () => {
      // Dynamic import to avoid circular dependency (pages.ts imports Actions)
      const { CommandBarDialog } = await import(
        '@/components/ui-new/dialogs/CommandBarDialog'
      );
      CommandBarDialog.show();
    },
  },

  // === Diff View Actions ===
  ToggleDiffViewMode: {
    id: 'toggle-diff-view-mode',
    label: () =>
      useDiffViewStore.getState().mode === 'unified'
        ? 'Switch to Side-by-Side View'
        : 'Switch to Inline View',
    icon: ColumnsIcon,
    requiresTarget: false,
    isVisible: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES,
    isActive: (ctx) => ctx.diffViewMode === 'split',
    getIcon: (ctx) => (ctx.diffViewMode === 'split' ? ColumnsIcon : RowsIcon),
    getTooltip: (ctx) =>
      ctx.diffViewMode === 'split' ? 'Inline view' : 'Side-by-side view',
    execute: () => {
      useDiffViewStore.getState().toggle();
    },
  },

  ToggleIgnoreWhitespace: {
    id: 'toggle-ignore-whitespace',
    label: () =>
      useDiffViewStore.getState().ignoreWhitespace
        ? 'Show Whitespace Changes'
        : 'Ignore Whitespace Changes',
    icon: EyeSlashIcon,
    requiresTarget: false,
    isVisible: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES,
    execute: () => {
      const store = useDiffViewStore.getState();
      store.setIgnoreWhitespace(!store.ignoreWhitespace);
    },
  },

  ToggleWrapLines: {
    id: 'toggle-wrap-lines',
    label: () =>
      useDiffViewStore.getState().wrapText
        ? 'Disable Line Wrapping'
        : 'Enable Line Wrapping',
    icon: TextAlignLeftIcon,
    shortcut: 'T W',
    requiresTarget: false,
    isVisible: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES,
    execute: () => {
      const store = useDiffViewStore.getState();
      store.setWrapText(!store.wrapText);
    },
  },

  // === Layout Panel Actions ===
  ToggleLeftSidebar: {
    id: 'toggle-left-sidebar',
    label: () =>
      useUiPreferencesStore.getState().isLeftSidebarVisible
        ? 'Hide Left Sidebar'
        : 'Show Left Sidebar',
    icon: SidebarSimpleIcon,
    shortcut: 'V S',
    requiresTarget: false,
    isActive: (ctx) => ctx.isLeftSidebarVisible,
    execute: () => {
      useUiPreferencesStore.getState().toggleLeftSidebar();
    },
  },

  ToggleLeftMainPanel: {
    id: 'toggle-left-main-panel',
    label: 'Toggle Chat Panel',
    icon: ChatsTeardropIcon,
    shortcut: 'V H',
    requiresTarget: false,
    isActive: (ctx) => ctx.isLeftMainPanelVisible,
    isEnabled: (ctx) =>
      !(ctx.isLeftMainPanelVisible && ctx.rightMainPanelMode === null),
    getLabel: (ctx) =>
      ctx.isLeftMainPanelVisible ? 'Hide Chat Panel' : 'Show Chat Panel',
    execute: (ctx) => {
      useUiPreferencesStore
        .getState()
        .toggleLeftMainPanel(ctx.currentWorkspaceId ?? undefined);
    },
  },

  ToggleRightSidebar: {
    id: 'toggle-right-sidebar',
    label: () =>
      useUiPreferencesStore.getState().isRightSidebarVisible
        ? 'Hide Right Sidebar'
        : 'Show Right Sidebar',
    icon: RightSidebarIcon,
    requiresTarget: false,
    isActive: (ctx) => ctx.isRightSidebarVisible,
    execute: () => {
      useUiPreferencesStore.getState().toggleRightSidebar();
    },
  },

  ToggleChangesMode: {
    id: 'toggle-changes-mode',
    label: 'Toggle Changes Panel',
    icon: GitDiffIcon,
    shortcut: 'V C',
    requiresTarget: false,
    isVisible: (ctx) => !ctx.isCreateMode,
    isActive: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES,
    isEnabled: (ctx) => !ctx.isCreateMode,
    getLabel: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES
        ? 'Hide Changes Panel'
        : 'Show Changes Panel',
    execute: (ctx) => {
      useUiPreferencesStore
        .getState()
        .toggleRightMainPanelMode(
          RIGHT_MAIN_PANEL_MODES.CHANGES,
          ctx.currentWorkspaceId ?? undefined
        );
    },
  },

  ToggleLogsMode: {
    id: 'toggle-logs-mode',
    label: 'Toggle Logs Panel',
    icon: TerminalIcon,
    shortcut: 'V L',
    requiresTarget: false,
    isVisible: (ctx) => !ctx.isCreateMode,
    isActive: (ctx) => ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS,
    isEnabled: (ctx) => !ctx.isCreateMode,
    getLabel: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS
        ? 'Hide Logs Panel'
        : 'Show Logs Panel',
    execute: (ctx) => {
      useUiPreferencesStore
        .getState()
        .toggleRightMainPanelMode(
          RIGHT_MAIN_PANEL_MODES.LOGS,
          ctx.currentWorkspaceId ?? undefined
        );
    },
  },

  TogglePreviewMode: {
    id: 'toggle-preview-mode',
    label: 'Toggle Preview Panel',
    icon: DesktopIcon,
    shortcut: 'V P',
    requiresTarget: false,
    isVisible: (ctx) => !ctx.isCreateMode,
    isActive: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW,
    isEnabled: (ctx) => !ctx.isCreateMode,
    getLabel: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW
        ? 'Hide Preview Panel'
        : 'Show Preview Panel',
    execute: (ctx) => {
      useUiPreferencesStore
        .getState()
        .toggleRightMainPanelMode(
          RIGHT_MAIN_PANEL_MODES.PREVIEW,
          ctx.currentWorkspaceId ?? undefined
        );
    },
  },

  // === Navigation Actions ===
  OpenInOldUI: {
    id: 'open-in-old-ui',
    label: 'Open in Old UI',
    icon: SignOutIcon,
    requiresTarget: false,
    execute: async (ctx) => {
      // If no workspace is selected, navigate to root
      if (!ctx.currentWorkspaceId) {
        ctx.navigate('/');
        return;
      }

      const workspace = await getWorkspace(
        ctx.queryClient,
        ctx.currentWorkspaceId
      );
      if (!workspace?.task_id) {
        ctx.navigate('/');
        return;
      }

      // Fetch task lazily to get project_id
      const task = await tasksApi.getById(workspace.task_id);
      if (task?.project_id) {
        ctx.navigate(`/projects/${task.project_id}/tasks/${workspace.task_id}`);
      } else {
        ctx.navigate('/');
      }
    },
  },

  // === Diff Actions for Navbar ===
  ToggleAllDiffs: {
    id: 'toggle-all-diffs',
    label: () => {
      const { diffPaths } = useDiffViewStore.getState();
      const { expanded } = useUiPreferencesStore.getState();
      const keys = diffPaths.map((p) => `diff:${p}`);
      const isAllExpanded =
        keys.length > 0 && keys.every((k) => expanded[k] !== false);
      return isAllExpanded ? 'Collapse All Diffs' : 'Expand All Diffs';
    },
    icon: CaretDoubleUpIcon,
    requiresTarget: false,
    isVisible: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES,
    getIcon: (ctx) =>
      ctx.isAllDiffsExpanded ? CaretDoubleUpIcon : CaretDoubleDownIcon,
    getTooltip: (ctx) =>
      ctx.isAllDiffsExpanded ? 'Collapse all diffs' : 'Expand all diffs',
    execute: () => {
      const { diffPaths } = useDiffViewStore.getState();
      const { expanded, setExpandedAll } = useUiPreferencesStore.getState();
      const keys = diffPaths.map((p) => `diff:${p}`);
      const isAllExpanded =
        keys.length > 0 && keys.every((k) => expanded[k] !== false);
      setExpandedAll(keys, !isAllExpanded);
    },
  },

  // === ContextBar Actions ===
  OpenInIDE: {
    id: 'open-in-ide',
    label: 'Open in IDE',
    icon: 'ide-icon' as const,
    requiresTarget: false,
    isVisible: (ctx) => ctx.hasWorkspace,
    getTooltip: (ctx) => `Open in ${getIdeName(ctx.editorType)}`,
    execute: async (ctx) => {
      if (!ctx.currentWorkspaceId) return;
      try {
        const response = await attemptsApi.openEditor(ctx.currentWorkspaceId, {
          editor_type: null,
          file_path: null,
        });
        if (response.url) {
          window.open(response.url, '_blank');
        }
      } catch {
        // Show editor selection dialog on failure
        EditorSelectionDialog.show({
          selectedAttemptId: ctx.currentWorkspaceId,
        });
      }
    },
  },

  CopyWorkspacePath: {
    id: 'copy-workspace-path',
    label: 'Copy Workspace Path',
    icon: 'copy-icon' as const,
    shortcut: 'Y P',
    requiresTarget: false,
    isVisible: (ctx) => ctx.hasWorkspace,
    execute: async (ctx) => {
      if (!ctx.containerRef) return;
      await navigator.clipboard.writeText(ctx.containerRef);
    },
  },

  CopyRawLogs: {
    id: 'copy-raw-logs',
    label: 'Copy Raw Logs',
    icon: CopyIcon,
    shortcut: 'Y L',
    requiresTarget: false,
    isVisible: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS &&
      ctx.logsPanelContent?.type !== 'terminal',
    execute: async (ctx) => {
      if (!ctx.currentLogs || ctx.currentLogs.length === 0) return;
      const rawText = ctx.currentLogs.map((log) => log.content).join('\n');
      await navigator.clipboard.writeText(rawText);
    },
  },

  ToggleDevServer: {
    id: 'toggle-dev-server',
    label: 'Dev Server',
    icon: PlayIcon,
    shortcut: 'T D',
    requiresTarget: false,
    isVisible: (ctx) => ctx.hasWorkspace,
    isEnabled: (ctx) =>
      ctx.devServerState !== 'starting' && ctx.devServerState !== 'stopping',
    getIcon: (ctx) => {
      if (
        ctx.devServerState === 'starting' ||
        ctx.devServerState === 'stopping'
      ) {
        return SpinnerIcon;
      }
      if (ctx.devServerState === 'running') {
        return PauseIcon;
      }
      return PlayIcon;
    },
    getTooltip: (ctx) => {
      switch (ctx.devServerState) {
        case 'starting':
          return 'Starting dev server...';
        case 'stopping':
          return 'Stopping dev server...';
        case 'running':
          return 'Stop dev server';
        default:
          return 'Start dev server';
      }
    },
    getLabel: (ctx) =>
      ctx.devServerState === 'running' ? 'Stop Dev Server' : 'Start Dev Server',
    execute: (ctx) => {
      if (ctx.runningDevServers.length > 0) {
        ctx.stopDevServer();
      } else {
        ctx.startDevServer();
        // Auto-open preview mode when starting dev server
        useUiPreferencesStore
          .getState()
          .setRightMainPanelMode(
            RIGHT_MAIN_PANEL_MODES.PREVIEW,
            ctx.currentWorkspaceId ?? undefined
          );
      }
    },
  },

  // === Git Actions ===
  GitCreatePR: {
    id: 'git-create-pr',
    label: 'Create Pull Request',
    icon: GitPullRequestIcon,
    shortcut: 'X P',
    requiresTarget: 'git',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    execute: async (ctx, workspaceId, repoId) => {
      const workspace = await getWorkspace(ctx.queryClient, workspaceId);
      const task = await tasksApi.getById(workspace.task_id);

      const repos = await attemptsApi.getRepos(workspaceId);
      const repo = repos.find((r) => r.id === repoId);

      const result = await CreatePRDialog.show({
        attempt: workspace,
        task: {
          ...task,
          has_in_progress_attempt: false,
          last_attempt_failed: false,
          executor: '',
        },
        repoId,
        targetBranch: repo?.target_branch,
      });

      if (!result.success && result.error) {
        throw new Error(result.error);
      }
    },
  },

  GitMerge: {
    id: 'git-merge',
    label: 'Merge',
    icon: GitMergeIcon,
    shortcut: 'X M',
    requiresTarget: 'git',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    execute: async (ctx, workspaceId, repoId) => {
      // Check for existing conflicts first
      const branchStatus = await attemptsApi.getBranchStatus(workspaceId);
      const repoStatus = branchStatus?.find((s) => s.repo_id === repoId);
      const hasConflicts =
        repoStatus?.is_rebase_in_progress ||
        (repoStatus?.conflicted_files?.length ?? 0) > 0;

      if (hasConflicts && repoStatus) {
        // Show resolve conflicts dialog
        const workspace = await getWorkspace(ctx.queryClient, workspaceId);
        const result = await ResolveConflictsDialog.show({
          workspaceId,
          conflictOp: repoStatus.conflict_op ?? 'merge',
          sourceBranch: workspace.branch,
          targetBranch: repoStatus.target_branch_name,
          conflictedFiles: repoStatus.conflicted_files ?? [],
          repoName: repoStatus.repo_name,
        });

        if (result.action === 'resolved') {
          invalidateWorkspaceQueries(ctx.queryClient, workspaceId);
        }
        return;
      }

      // Check if branch is behind - need to rebase first
      const commitsBehind = repoStatus?.commits_behind ?? 0;
      if (commitsBehind > 0) {
        // Prompt user to rebase first
        const confirmRebase = await ConfirmDialog.show({
          title: 'Rebase Required',
          message: `Your branch is ${commitsBehind} commit${commitsBehind === 1 ? '' : 's'} behind the target branch. Would you like to rebase first?`,
          confirmText: 'Rebase',
          cancelText: 'Cancel',
        });

        if (confirmRebase === 'confirmed') {
          // Trigger the rebase action
          const repos = await attemptsApi.getRepos(workspaceId);
          const repo = repos.find((r) => r.id === repoId);
          if (!repo) throw new Error('Repository not found');

          const branches = await repoApi.getBranches(repoId);
          await RebaseDialog.show({
            attemptId: workspaceId,
            repoId,
            branches,
            initialTargetBranch: repo.target_branch,
          });
        }
        return;
      }

      const confirmResult = await ConfirmDialog.show({
        title: 'Merge Branch',
        message:
          'Are you sure you want to merge this branch into the target branch?',
        confirmText: 'Merge',
        cancelText: 'Cancel',
      });

      if (confirmResult === 'confirmed') {
        await attemptsApi.merge(workspaceId, { repo_id: repoId });
        invalidateWorkspaceQueries(ctx.queryClient, workspaceId);
      }
    },
  },

  GitRebase: {
    id: 'git-rebase',
    label: 'Rebase',
    icon: ArrowsClockwiseIcon,
    shortcut: 'X R',
    requiresTarget: 'git',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    execute: async (ctx, workspaceId, repoId) => {
      // Check for existing conflicts first
      const branchStatus = await attemptsApi.getBranchStatus(workspaceId);
      const repoStatus = branchStatus?.find((s) => s.repo_id === repoId);
      const hasConflicts =
        repoStatus?.is_rebase_in_progress ||
        (repoStatus?.conflicted_files?.length ?? 0) > 0;

      if (hasConflicts && repoStatus) {
        // Show resolve conflicts dialog
        const workspace = await getWorkspace(ctx.queryClient, workspaceId);
        const result = await ResolveConflictsDialog.show({
          workspaceId,
          conflictOp: repoStatus.conflict_op ?? 'rebase',
          sourceBranch: workspace.branch,
          targetBranch: repoStatus.target_branch_name,
          conflictedFiles: repoStatus.conflicted_files ?? [],
          repoName: repoStatus.repo_name,
        });

        if (result.action === 'resolved') {
          invalidateWorkspaceQueries(ctx.queryClient, workspaceId);
        }
        return;
      }

      const repos = await attemptsApi.getRepos(workspaceId);
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) throw new Error('Repository not found');

      const branches = await repoApi.getBranches(repoId);
      await RebaseDialog.show({
        attemptId: workspaceId,
        repoId,
        branches,
        initialTargetBranch: repo.target_branch,
      });
    },
  },

  GitChangeTarget: {
    id: 'git-change-target',
    label: 'Change Target Branch',
    icon: CrosshairIcon,
    requiresTarget: 'git',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    execute: async (_ctx, workspaceId, repoId) => {
      const branches = await repoApi.getBranches(repoId);
      await ChangeTargetDialog.show({
        attemptId: workspaceId,
        repoId,
        branches,
      });
    },
  },

  GitPush: {
    id: 'git-push',
    label: 'Push',
    icon: ArrowUpIcon,
    shortcut: 'X U',
    requiresTarget: 'git',
    isVisible: (ctx) =>
      ctx.hasWorkspace &&
      ctx.hasGitRepos &&
      ctx.hasOpenPR &&
      ctx.hasUnpushedCommits,
    execute: async (ctx, workspaceId, repoId) => {
      const result = await attemptsApi.push(workspaceId, { repo_id: repoId });
      if (!result.success) {
        if (result.error?.type === 'force_push_required') {
          throw new Error(
            'Force push required. The remote branch has diverged.'
          );
        }
        throw new Error('Failed to push changes');
      }
      invalidateWorkspaceQueries(ctx.queryClient, workspaceId);
    },
  },

  // === Repo-specific Actions (for command bar when selecting a repo) ===
  RepoCopyPath: {
    id: 'repo-copy-path',
    label: 'Copy Repo Path',
    icon: CopyIcon,
    requiresTarget: 'git',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    execute: async (_ctx, _workspaceId, repoId) => {
      try {
        const repo = await repoApi.getById(repoId);
        if (repo?.path) {
          await navigator.clipboard.writeText(repo.path);
        }
      } catch (err) {
        console.error('Failed to copy repo path:', err);
        throw new Error('Failed to copy repository path');
      }
    },
  },

  RepoOpenInIDE: {
    id: 'repo-open-in-ide',
    label: 'Open Repo in IDE',
    icon: DesktopIcon,
    requiresTarget: 'git',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    execute: async (_ctx, _workspaceId, repoId) => {
      try {
        const response = await repoApi.openEditor(repoId, {
          editor_type: null,
          file_path: null,
        });
        if (response.url) {
          window.open(response.url, '_blank');
        }
      } catch (err) {
        console.error('Failed to open repo in editor:', err);
        throw new Error('Failed to open repository in IDE');
      }
    },
  },

  RepoSettings: {
    id: 'repo-settings',
    label: 'Repository Settings',
    icon: GearIcon,
    requiresTarget: 'git',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    execute: (ctx, _workspaceId, repoId) => {
      ctx.navigate(`/settings/repos?repoId=${repoId}`);
    },
  },

  // === Script Actions ===
  RunSetupScript: {
    id: 'run-setup-script',
    label: 'Run Setup Script',
    icon: TerminalIcon,
    shortcut: 'R S',
    requiresTarget: true,
    isVisible: (ctx) => ctx.hasWorkspace,
    isEnabled: (ctx) => !ctx.isAttemptRunning,
    execute: async (_ctx, workspaceId) => {
      const result = await attemptsApi.runSetupScript(workspaceId);
      if (!result.success) {
        if (result.error?.type === 'no_script_configured') {
          throw new Error('No setup script configured for this project');
        }
        if (result.error?.type === 'process_already_running') {
          throw new Error('Cannot run script while another process is running');
        }
        throw new Error('Failed to run setup script');
      }
    },
  },

  RunCleanupScript: {
    id: 'run-cleanup-script',
    label: 'Run Cleanup Script',
    icon: TerminalIcon,
    shortcut: 'R C',
    requiresTarget: true,
    isVisible: (ctx) => ctx.hasWorkspace,
    isEnabled: (ctx) => !ctx.isAttemptRunning,
    execute: async (_ctx, workspaceId) => {
      const result = await attemptsApi.runCleanupScript(workspaceId);
      if (!result.success) {
        if (result.error?.type === 'no_script_configured') {
          throw new Error('No cleanup script configured for this project');
        }
        if (result.error?.type === 'process_already_running') {
          throw new Error('Cannot run script while another process is running');
        }
        throw new Error('Failed to run cleanup script');
      }
    },
  },
} as const satisfies Record<string, ActionDefinition>;

// Helper to resolve dynamic label
export function resolveLabel(
  action: ActionDefinition,
  workspace?: Workspace
): string {
  return typeof action.label === 'function'
    ? action.label(workspace)
    : action.label;
}

// Divider marker for navbar action groups
export const NavbarDivider = { type: 'divider' } as const;
export type NavbarItem = ActionDefinition | typeof NavbarDivider;

// Navbar action groups define which actions appear in each section
export const NavbarActionGroups = {
  left: [Actions.ArchiveWorkspace, Actions.OpenInOldUI] as ActionDefinition[],
  right: [
    Actions.ToggleDiffViewMode,
    Actions.ToggleAllDiffs,
    NavbarDivider,
    Actions.ToggleLeftSidebar,
    Actions.ToggleLeftMainPanel,
    Actions.ToggleChangesMode,
    Actions.ToggleLogsMode,
    Actions.TogglePreviewMode,
    Actions.ToggleRightSidebar,
    NavbarDivider,
    Actions.OpenCommandBar,
    Actions.Feedback,
    Actions.WorkspacesGuide,
    Actions.Settings,
  ] as NavbarItem[],
};

// Divider marker for context bar action groups
export const ContextBarDivider = { type: 'divider' } as const;
export type ContextBarItem = ActionDefinition | typeof ContextBarDivider;

// ContextBar action groups define which actions appear in each section
export const ContextBarActionGroups = {
  primary: [Actions.OpenInIDE, Actions.CopyWorkspacePath] as ActionDefinition[],
  secondary: [
    Actions.ToggleDevServer,
    Actions.TogglePreviewMode,
    Actions.ToggleChangesMode,
  ] as ActionDefinition[],
};

// Helper to check if an icon is a special type
export function isSpecialIcon(icon: ActionIcon): icon is SpecialIconType {
  return icon === 'ide-icon' || icon === 'copy-icon';
}
