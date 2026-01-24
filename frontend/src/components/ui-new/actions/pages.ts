import type { Icon } from '@phosphor-icons/react';
import { type ActionDefinition, type ActionVisibilityContext } from './index';
import { Actions } from './index';
import { RIGHT_MAIN_PANEL_MODES } from '@/stores/useUiPreferencesStore';

// Define page IDs first to avoid circular reference
export type PageId =
  | 'root'
  | 'workspaceActions'
  | 'diffOptions'
  | 'viewOptions'
  | 'repoActions' // Page for repo-specific actions (opened from repo card or CMD+K)
  | 'selectRepo'; // Dynamic page for repo selection (not in Pages record)

// Items that can appear inside a group
export type CommandBarGroupItem =
  | { type: 'action'; action: ActionDefinition }
  | { type: 'page'; pageId: PageId; label: string; icon: Icon }
  | { type: 'childPages'; id: PageId };

// Group container with label and nested items
export interface CommandBarGroup {
  type: 'group';
  label: string;
  items: CommandBarGroupItem[];
}

// Top-level items in a page are groups
export type CommandBarItem = CommandBarGroup;

// Repo item for dynamic repo selection page
export interface RepoItem {
  id: string;
  display_name: string;
}

// Resolved types (after childPages expansion)
export type ResolvedGroupItem =
  | { type: 'action'; action: ActionDefinition }
  | { type: 'page'; pageId: PageId; label: string; icon: Icon }
  | { type: 'repo'; repo: RepoItem };

export interface ResolvedGroup {
  label: string;
  items: ResolvedGroupItem[];
}

export interface CommandBarPage {
  id: string;
  title?: string; // Optional heading shown in command bar
  items: CommandBarItem[];
  // Optional: parent page for back button navigation
  parent?: PageId;
  // Optional visibility condition - if omitted, page is always visible
  isVisible?: (ctx: ActionVisibilityContext) => boolean;
}

// Static page IDs (excludes dynamic pages like selectRepo)
export type StaticPageId = Exclude<PageId, 'selectRepo'>;

export const Pages: Record<StaticPageId, CommandBarPage> = {
  // Root page - shown when opening via CMD+K
  root: {
    id: 'root',
    items: [
      {
        type: 'group',
        label: 'Actions',
        items: [
          { type: 'action', action: Actions.NewWorkspace },
          { type: 'action', action: Actions.OpenInIDE },
          { type: 'action', action: Actions.CopyWorkspacePath },
          { type: 'action', action: Actions.CopyRawLogs },
          { type: 'action', action: Actions.ToggleDevServer },
          { type: 'action', action: Actions.OpenInOldUI },
          { type: 'childPages', id: 'workspaceActions' },
          { type: 'childPages', id: 'repoActions' },
        ],
      },
      {
        type: 'group',
        label: 'View',
        items: [
          { type: 'childPages', id: 'viewOptions' },
          { type: 'childPages', id: 'diffOptions' },
        ],
      },
      {
        type: 'group',
        label: 'General',
        items: [
          { type: 'action', action: Actions.Feedback },
          { type: 'action', action: Actions.WorkspacesGuide },
          { type: 'action', action: Actions.Settings },
        ],
      },
    ],
  },

  // Workspace actions page - shown when clicking three-dots on a workspace
  workspaceActions: {
    id: 'workspace-actions',
    title: 'Workspace Actions',
    parent: 'root',
    isVisible: (ctx) => ctx.hasWorkspace,
    items: [
      {
        type: 'group',
        label: 'Workspace',
        items: [
          { type: 'action', action: Actions.StartReview },
          { type: 'action', action: Actions.RenameWorkspace },
          { type: 'action', action: Actions.DuplicateWorkspace },
          { type: 'action', action: Actions.SpinOffWorkspace },
          { type: 'action', action: Actions.PinWorkspace },
          { type: 'action', action: Actions.ArchiveWorkspace },
          { type: 'action', action: Actions.DeleteWorkspace },
        ],
      },
      {
        type: 'group',
        label: 'Scripts',
        items: [
          { type: 'action', action: Actions.RunSetupScript },
          { type: 'action', action: Actions.RunCleanupScript },
        ],
      },
    ],
  },

  // Diff options page - shown when changes panel is visible
  diffOptions: {
    id: 'diff-options',
    title: 'Diff Options',
    parent: 'root',
    isVisible: (ctx) =>
      ctx.rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES,
    items: [
      {
        type: 'group',
        label: 'Display',
        items: [
          { type: 'action', action: Actions.ToggleDiffViewMode },
          { type: 'action', action: Actions.ToggleWrapLines },
          { type: 'action', action: Actions.ToggleIgnoreWhitespace },
          { type: 'action', action: Actions.ToggleAllDiffs },
        ],
      },
    ],
  },

  // View options page - layout panel controls
  viewOptions: {
    id: 'view-options',
    title: 'View Options',
    parent: 'root',
    items: [
      {
        type: 'group',
        label: 'Panels',
        items: [
          { type: 'action', action: Actions.ToggleLeftSidebar },
          { type: 'action', action: Actions.ToggleLeftMainPanel },
          { type: 'action', action: Actions.ToggleRightSidebar },
          { type: 'action', action: Actions.ToggleChangesMode },
          { type: 'action', action: Actions.ToggleLogsMode },
          { type: 'action', action: Actions.TogglePreviewMode },
        ],
      },
    ],
  },

  // Repository actions page - shown when clicking "..." on a repo card or via CMD+K
  repoActions: {
    id: 'repo-actions',
    title: 'Repository Actions',
    parent: 'root',
    isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
    items: [
      {
        type: 'group',
        label: 'Actions',
        items: [
          { type: 'action', action: Actions.RepoCopyPath },
          { type: 'action', action: Actions.RepoOpenInIDE },
          { type: 'action', action: Actions.RepoSettings },
          { type: 'action', action: Actions.GitCreatePR },
          { type: 'action', action: Actions.GitMerge },
          { type: 'action', action: Actions.GitPush },
          { type: 'action', action: Actions.GitRebase },
          { type: 'action', action: Actions.GitChangeTarget },
        ],
      },
    ],
  },
};

// Get all actions from a specific page
export function getPageActions(pageId: StaticPageId): ActionDefinition[] {
  const page = Pages[pageId];
  const actions: ActionDefinition[] = [];

  for (const group of page.items) {
    for (const item of group.items) {
      if (item.type === 'action') {
        actions.push(item.action);
      }
    }
  }

  return actions;
}
