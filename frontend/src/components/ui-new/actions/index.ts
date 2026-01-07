import type { Icon } from '@phosphor-icons/react';
import type { NavigateFunction } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';
import type { Workspace } from 'shared/types';
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
  ArrowSquareOutIcon,
  CaretDoubleUpIcon,
  CaretDoubleDownIcon,
} from '@phosphor-icons/react';
import { useDiffViewStore } from '@/stores/useDiffViewStore';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { attemptsApi, tasksApi } from '@/lib/api';
import { attemptKeys } from '@/hooks/useAttempt';
import { taskKeys } from '@/hooks/useTask';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import { ConfirmDialog } from '@/components/ui-new/dialogs/ConfirmDialog';

// Workspace type for sidebar (minimal subset needed for workspace selection)
interface SidebarWorkspace {
  id: string;
}

// Context provided to action executors (from React hooks)
export interface ActionExecutorContext {
  navigate: NavigateFunction;
  queryClient: QueryClient;
  // Optional workspace selection context (for archive action)
  selectWorkspace?: (workspaceId: string) => void;
  sidebarWorkspaces?: SidebarWorkspace[];
  // Current workspace ID (for actions that optionally use workspace context)
  currentWorkspaceId?: string;
}

// Context for evaluating action visibility and state conditions
export interface ActionVisibilityContext {
  // Layout state
  isChangesMode: boolean;
  isLogsMode: boolean;
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
}

// Base properties shared by all actions
interface ActionBase {
  id: string;
  label: string | ((workspace?: Workspace) => string);
  icon: Icon;
  shortcut?: string;
  variant?: 'default' | 'destructive';
  // Optional visibility condition - if omitted, action is always visible
  isVisible?: (ctx: ActionVisibilityContext) => boolean;
  // Optional active state - if omitted, action is not active
  isActive?: (ctx: ActionVisibilityContext) => boolean;
  // Optional enabled state - if omitted, action is enabled
  isEnabled?: (ctx: ActionVisibilityContext) => boolean;
  // Optional dynamic icon - if omitted, uses static icon property
  getIcon?: (ctx: ActionVisibilityContext) => Icon;
  // Optional dynamic tooltip - if omitted, uses label
  getTooltip?: (ctx: ActionVisibilityContext) => string;
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

// Discriminated union
export type ActionDefinition =
  | GlobalActionDefinition
  | WorkspaceActionDefinition;

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

      // Calculate next workspace before archiving (if we have the context)
      let nextWorkspaceId: string | null = null;
      if (!wasArchived && ctx.selectWorkspace && ctx.sidebarWorkspaces) {
        const currentIndex = ctx.sidebarWorkspaces.findIndex(
          (ws) => ws.id === workspaceId
        );
        if (currentIndex >= 0 && ctx.sidebarWorkspaces.length > 1) {
          const nextWorkspace =
            ctx.sidebarWorkspaces[currentIndex + 1] ||
            ctx.sidebarWorkspaces[currentIndex - 1];
          nextWorkspaceId = nextWorkspace?.id ?? null;
        }
      }

      // Perform the archive/unarchive
      await attemptsApi.update(workspaceId, { archived: !wasArchived });
      invalidateWorkspaceQueries(ctx.queryClient, workspaceId);

      // Select next workspace after successful archive
      if (!wasArchived && nextWorkspaceId && ctx.selectWorkspace) {
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
    shortcut: 'N',
    requiresTarget: false,
    execute: (ctx) => {
      ctx.navigate('/workspaces/create');
    },
  },

  Settings: {
    id: 'settings',
    label: 'Settings',
    icon: GearIcon,
    shortcut: ',',
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
    shortcut: '[',
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
    shortcut: ']',
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
    shortcut: 'C',
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
    shortcut: 'L',
    requiresTarget: false,
    isVisible: (ctx) => !ctx.isCreateMode,
    isActive: (ctx) => ctx.isLogsMode,
    isEnabled: (ctx) => !ctx.isCreateMode,
    execute: () => {
      useLayoutStore.getState().toggleLogsMode();
    },
  },

  // === Navigation Actions ===
  OpenInOldUI: {
    id: 'open-in-old-ui',
    label: 'Open in Old UI',
    icon: ArrowSquareOutIcon,
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
    Actions.ToggleGitPanel,
  ] as NavbarItem[],
};
