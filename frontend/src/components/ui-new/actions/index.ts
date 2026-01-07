import type { Icon } from '@phosphor-icons/react';
import type { NavigateFunction } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';
import type { Workspace } from 'shared/types';
import {
  CopyIcon,
  PushPinIcon,
  ArchiveIcon,
  TrashIcon,
  PlusIcon,
  GearIcon,
} from '@phosphor-icons/react';
import { attemptsApi, tasksApi } from '@/lib/api';
import { attemptKeys } from '@/hooks/useAttempt';
import { taskKeys } from '@/hooks/useTask';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import { ConfirmDialog } from '@/components/ui-new/dialogs/ConfirmDialog';

// Context provided to action executors (from React hooks)
export interface ActionExecutorContext {
  navigate: NavigateFunction;
  queryClient: QueryClient;
}

// Base properties shared by all actions
interface ActionBase {
  id: string;
  label: string | ((workspace?: Workspace) => string);
  icon: Icon;
  shortcut?: string;
  variant?: 'default' | 'destructive';
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
    execute: async (ctx, workspaceId) => {
      const workspace = getWorkspaceFromCache(ctx.queryClient, workspaceId);
      await attemptsApi.update(workspaceId, {
        archived: !workspace.archived,
      });
      invalidateWorkspaceQueries(ctx.queryClient, workspaceId);
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
