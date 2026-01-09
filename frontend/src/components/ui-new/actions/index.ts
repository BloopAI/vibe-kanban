import type { Icon } from '@phosphor-icons/react';
import type { NavigateFunction } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';
import type { EditorType, Workspace } from 'shared/types';
import type { DiffViewMode } from '@/stores/useDiffViewStore';
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
  ArrowsClockwiseIcon,
  CrosshairIcon,
  DesktopIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react';
import { useDiffViewStore } from '@/stores/useDiffViewStore';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { attemptsApi, tasksApi, repoApi } from '@/lib/api';
import { attemptKeys } from '@/hooks/useAttempt';
import { taskKeys } from '@/hooks/useTask';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import { ConfirmDialog } from '@/components/ui-new/dialogs/ConfirmDialog';
import { ChangeTargetDialog } from '@/components/ui-new/dialogs/ChangeTargetDialog';
import { RebaseDialog } from '@/components/ui-new/dialogs/RebaseDialog';
import { RenameWorkspaceDialog } from '@/components/ui-new/dialogs/RenameWorkspaceDialog';
import { CreatePRDialog } from '@/components/dialogs/tasks/CreatePRDialog';
import { getIdeName } from '@/components/ide/IdeIcon';
import { EditorSelectionDialog } from '@/components/dialogs/tasks/EditorSelectionDialog';

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
  runningDevServerId: string | null;
  startDevServer: () => void;
  stopDevServer: () => void;
}

// Context for evaluating action visibility and state conditions
export interface ActionVisibilityContext {
  // Layout state
  isChangesMode: boolean;
  isLogsMode: boolean;
  isPreviewMode: boolean;
  isSidebarVisible: boolean;
  isMainPanelVisible: boolean;
  isGitPanelVisible: boolean;
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
  runningDevServerId: string | null;

  // Git panel state
  hasGitRepos: boolean;
  hasMultipleRepos: boolean;
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

// Helper to get workspace from query cache
function getWorkspaceFromCache(
  queryClient: QueryClient,
  workspaceId: string
): Workspace {
  const workspace = queryClient.getQueryData<Workspace>(
    attemptKeys.byId(workspaceId)
  );
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  return workspace;
}

// Helper to invalidate workspace-related queries
function invalidateWorkspaceQueries(
  queryClient: QueryClient,
  workspaceId: string
) {
  queryClient.invalidateQueries({ queryKey: attemptKeys.byId(workspaceId) });
  queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
}

// All application actions
export const Actions = {
  // === Workspace Actions ===
  DuplicateWorkspace: {
    id: 'duplicate-workspace',
    label: 'Duplicate',
    icon: CopyIcon,
    requiresTarget: true,
    execute: async (ctx, workspaceId) => {
      try {
        const firstMessage = await attemptsApi.getFirstUserMessage(workspaceId);
        ctx.navigate('/workspaces/create', {
          state: { duplicatePrompt: firstMessage },
        });
      } catch {
        // Fallback to creating without the prompt
        ctx.navigate('/workspaces/create');
      }
    },
  },

  RenameWorkspace: {
    id: 'rename-workspace',
    label: 'Rename',
    icon: PencilSimpleIcon,
    requiresTarget: true,
    execute: async (ctx, workspaceId) => {
      const workspace = getWorkspaceFromCache(ctx.queryClient, workspaceId);
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
    requiresTarget: true,
    execute: async (ctx, workspaceId) => {
      const workspace = getWorkspaceFromCache(ctx.queryClient, workspaceId);
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
    requiresTarget: true,
    isVisible: (ctx) => ctx.hasWorkspace,
    isActive: (ctx) => ctx.workspaceArchived,
    execute: async (ctx, workspaceId) => {
      const workspace = getWorkspaceFromCache(ctx.queryClient, workspaceId);
      const wasArchived = workspace.archived;

      // Calculate next workspace before archiving
      let nextWorkspaceId: string | null = null;
      if (!wasArchived) {
        const currentIndex = ctx.activeWorkspaces.findIndex(
          (ws) => ws.id === workspaceId
        );
        if (currentIndex >= 0 && ctx.activeWorkspaces.length > 1) {
          const nextWorkspace =
            ctx.activeWorkspaces[currentIndex + 1] ||
            ctx.activeWorkspaces[currentIndex - 1];
          nextWorkspaceId = nextWorkspace?.id ?? null;
        }
      }

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
    variant: 'destructive',
    requiresTarget: true,
    execute: async (ctx, workspaceId) => {
      const workspace = getWorkspaceFromCache(ctx.queryClient, workspaceId);
      const result = await ConfirmDialog.show({
        title: 'Delete Workspace',
        message:
          'Are you sure you want to delete this workspace? This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'destructive',
      });
      if (result === 'confirmed') {
        await tasksApi.delete(workspace.task_id);
        ctx.queryClient.invalidateQueries({ queryKey: taskKeys.all });
        ctx.queryClient.invalidateQueries({
          queryKey: workspaceSummaryKeys.all,
        });
      }
    },
  },

  // === Global/Navigation Actions ===
  NewWorkspace: {
    id: 'new-workspace',
    label: 'New Workspace',
    icon: PlusIcon,
    requiresTarget: false,
    execute: (ctx) => {
      ctx.navigate('/workspaces/create');
    },
  },

  Settings: {
    id: 'settings',
    label: 'Settings',
    icon: GearIcon,
    requiresTarget: false,
    execute: (ctx) => {
      ctx.navigate('/settings');
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
    isVisible: (ctx) => ctx.isChangesMode,
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
    isVisible: (ctx) => ctx.isChangesMode,
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
    requiresTarget: false,
    isVisible: (ctx) => ctx.isChangesMode,
    execute: () => {
      const store = useDiffViewStore.getState();
      store.setWrapText(!store.wrapText);
    },
  },

  // === Layout Panel Actions ===
  ToggleSidebar: {
    id: 'toggle-sidebar',
    label: () =>
      useLayoutStore.getState().isSidebarVisible
        ? 'Hide Sidebar'
        : 'Show Sidebar',
    icon: SidebarSimpleIcon,
    requiresTarget: false,
    isActive: (ctx) => ctx.isSidebarVisible,
    execute: () => {
      useLayoutStore.getState().toggleSidebar();
    },
  },

  ToggleMainPanel: {
    id: 'toggle-main-panel',
    label: () =>
      useLayoutStore.getState().isMainPanelVisible
        ? 'Hide Chat Panel'
        : 'Show Chat Panel',
    icon: ChatsTeardropIcon,
    requiresTarget: false,
    isActive: (ctx) => ctx.isMainPanelVisible,
    isEnabled: (ctx) => !(ctx.isMainPanelVisible && !ctx.isChangesMode),
    execute: () => {
      useLayoutStore.getState().toggleMainPanel();
    },
  },

  ToggleGitPanel: {
    id: 'toggle-git-panel',
    label: () =>
      useLayoutStore.getState().isGitPanelVisible
        ? 'Hide Git Panel'
        : 'Show Git Panel',
    icon: SidebarSimpleIcon,
    requiresTarget: false,
    isActive: (ctx) => ctx.isGitPanelVisible,
    execute: () => {
      useLayoutStore.getState().toggleGitPanel();
    },
  },

  ToggleChangesMode: {
    id: 'toggle-changes-mode',
    label: () =>
      useLayoutStore.getState().isChangesMode
        ? 'Hide Changes Panel'
        : 'Show Changes Panel',
    icon: GitDiffIcon,
    requiresTarget: false,
    isVisible: (ctx) => !ctx.isCreateMode,
    isActive: (ctx) => ctx.isChangesMode,
    isEnabled: (ctx) => !ctx.isCreateMode,
    execute: () => {
      useLayoutStore.getState().toggleChangesMode();
    },
  },

  ToggleLogsMode: {
    id: 'toggle-logs-mode',
    label: () =>
      useLayoutStore.getState().isLogsMode
        ? 'Hide Logs Panel'
        : 'Show Logs Panel',
    icon: TerminalIcon,
    requiresTarget: false,
    isVisible: (ctx) => !ctx.isCreateMode,
    isActive: (ctx) => ctx.isLogsMode,
    isEnabled: (ctx) => !ctx.isCreateMode,
    execute: () => {
      useLayoutStore.getState().toggleLogsMode();
    },
  },

  TogglePreviewMode: {
    id: 'toggle-preview-mode',
    label: () =>
      useLayoutStore.getState().isPreviewMode
        ? 'Hide Preview Panel'
        : 'Show Preview Panel',
    icon: DesktopIcon,
    requiresTarget: false,
    isVisible: (ctx) => !ctx.isCreateMode,
    isActive: (ctx) => ctx.isPreviewMode,
    isEnabled: (ctx) => !ctx.isCreateMode,
    execute: () => {
      useLayoutStore.getState().togglePreviewMode();
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

      const workspace = getWorkspaceFromCache(
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
        ctx.navigate(
          `/projects/${task.project_id}/tasks/${workspace.task_id}/attempts/${workspace.id}`
        );
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
    isVisible: (ctx) => ctx.isChangesMode,
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

  CopyPath: {
    id: 'copy-path',
    label: 'Copy path',
    icon: 'copy-icon' as const,
    requiresTarget: false,
    isVisible: (ctx) => ctx.hasWorkspace,
    execute: async (ctx) => {
      if (!ctx.containerRef) return;
      await navigator.clipboard.writeText(ctx.containerRef);
    },
  },

  ToggleDevServer: {
    id: 'toggle-dev-server',
    label: 'Dev Server',
    icon: PlayIcon,
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
      if (ctx.runningDevServerId) {
        ctx.stopDevServer();
      } else {
        ctx.startDevServer();
      }
    },
  },

  // === Git Actions ===
  GitCreatePR: {
    id: 'git-create-pr',
    label: 'Create Pull Request',
    icon: GitPullRequestIcon,
    requiresTarget: 'git',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    execute: async (ctx, workspaceId, repoId) => {
      const workspace = getWorkspaceFromCache(ctx.queryClient, workspaceId);
      const task = await tasksApi.getById(workspace.task_id);

      const result = await CreatePRDialog.show({
        attempt: workspace,
        task: {
          ...task,
          has_in_progress_attempt: false,
          last_attempt_failed: false,
          executor: '',
        },
        repoId,
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
    requiresTarget: 'git',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    execute: async (ctx, workspaceId, repoId) => {
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
    requiresTarget: 'git',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    execute: async (_ctx, workspaceId, repoId) => {
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
    Actions.ToggleSidebar,
    Actions.ToggleMainPanel,
    Actions.ToggleChangesMode,
    Actions.ToggleLogsMode,
    Actions.TogglePreviewMode,
    Actions.ToggleGitPanel,
  ] as NavbarItem[],
};

// Divider marker for context bar action groups
export const ContextBarDivider = { type: 'divider' } as const;
export type ContextBarItem = ActionDefinition | typeof ContextBarDivider;

// ContextBar action groups define which actions appear in each section
export const ContextBarActionGroups = {
  primary: [Actions.OpenInIDE, Actions.CopyPath] as ActionDefinition[],
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
