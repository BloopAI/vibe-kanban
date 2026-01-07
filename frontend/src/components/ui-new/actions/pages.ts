import type { Icon } from '@phosphor-icons/react';
import { type ActionDefinition } from './index';
import { Actions } from './index';

// Define page IDs first to avoid circular reference
export type PageId = 'root' | 'workspaceActions' | 'diffOptions';

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

// Resolved types (after childPages expansion)
export type ResolvedGroupItem =
  | { type: 'action'; action: ActionDefinition }
  | { type: 'page'; pageId: PageId; label: string; icon: Icon };

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
}

export const Pages: Record<PageId, CommandBarPage> = {
  // Root page - shown when opening via CMD+K
  root: {
    id: 'root',
    items: [
      {
        type: 'group',
        label: 'Actions',
        items: [
          { type: 'action', action: Actions.NewWorkspace },
          { type: 'childPages', id: 'workspaceActions' },
        ],
      },
      {
        type: 'group',
        label: 'General',
        items: [
          { type: 'action', action: Actions.Settings },
          { type: 'childPages', id: 'diffOptions' },
        ],
      },
    ],
  },

  // Workspace actions page - shown when clicking three-dots on a workspace
  workspaceActions: {
    id: 'workspace-actions',
    title: 'Workspace Actions',
    parent: 'root',
    items: [
      {
        type: 'group',
        label: 'Workspace',
        items: [
          { type: 'action', action: Actions.DuplicateWorkspace },
          { type: 'action', action: Actions.PinWorkspace },
          { type: 'action', action: Actions.ArchiveWorkspace },
          { type: 'action', action: Actions.DeleteWorkspace },
        ],
      },
    ],
  },

  // Diff options page - shown when changes panel is visible
  diffOptions: {
    id: 'diff-options',
    title: 'Diff Options',
    parent: 'root',
    items: [
      {
        type: 'group',
        label: 'View',
        items: [
          { type: 'action', action: Actions.ToggleDiffViewMode },
          { type: 'action', action: Actions.ToggleWrapLines },
        ],
      },
      {
        type: 'group',
        label: 'Display',
        items: [
          { type: 'action', action: Actions.ToggleIgnoreWhitespace },
          { type: 'action', action: Actions.ExpandAllDiffs },
          { type: 'action', action: Actions.CollapseAllDiffs },
        ],
      },
    ],
  },
};

// Get all actions from a specific page
export function getPageActions(pageId: PageId): ActionDefinition[] {
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
