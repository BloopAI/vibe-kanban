export enum Scope {
  GLOBAL = 'global',
  DIALOG = 'dialog',
  CONFIRMATION = 'confirmation',
  KANBAN = 'kanban',
  PROJECTS = 'projects',
  SETTINGS = 'settings',
  EDIT_COMMENT = 'edit-comment',
  APPROVALS = 'approvals',
  FOLLOW_UP = 'follow-up',
  FOLLOW_UP_READY = 'follow-up-ready',
  SIDEBAR = 'sidebar',
}

export enum Action {
  EXIT = 'exit',
  CREATE = 'create',
  SUBMIT = 'submit',
  FOCUS_SEARCH = 'focus_search',
  NAV_UP = 'nav_up',
  NAV_DOWN = 'nav_down',
  NAV_LEFT = 'nav_left',
  NAV_RIGHT = 'nav_right',
  OPEN_DETAILS = 'open_details',
  SHOW_HELP = 'show_help',
  DELETE_TASK = 'delete_task',
  APPROVE_REQUEST = 'approve_request',
  DENY_APPROVAL = 'deny_approval',
  SUBMIT_FOLLOW_UP = 'submit_follow_up',
  SUBMIT_TASK = 'submit_task',
  SUBMIT_TASK_ALT = 'submit_task_alt',
  SUBMIT_COMMENT = 'submit_comment',
  CYCLE_VIEW_BACKWARD = 'cycle_view_backward',
  // Sidebar actions
  TOGGLE_SIDEBAR = 'toggle_sidebar',
  GO_INBOX = 'go_inbox',
  GO_MY_ISSUES = 'go_my_issues',
  GO_PROJECTS = 'go_projects',
  COMMAND_PALETTE = 'command_palette',
}

export interface KeyBinding {
  action: Action;
  keys: string | string[];
  scopes?: Scope[];
  description: string;
  group?: string;
}

export const keyBindings: KeyBinding[] = [
  // Exit/Close actions
  {
    action: Action.EXIT,
    keys: 'esc',
    scopes: [Scope.CONFIRMATION],
    description: 'Close confirmation dialog',
    group: 'Dialog',
  },
  {
    action: Action.EXIT,
    keys: 'esc',
    scopes: [Scope.DIALOG],
    description: 'Close dialog or blur input',
    group: 'Dialog',
  },
  {
    action: Action.EXIT,
    keys: 'esc',
    scopes: [Scope.KANBAN],
    description: 'Close panel or navigate to projects',
    group: 'Navigation',
  },
  {
    action: Action.EXIT,
    keys: 'esc',
    scopes: [Scope.EDIT_COMMENT],
    description: 'Cancel comment',
    group: 'Comments',
  },
  {
    action: Action.EXIT,
    keys: 'esc',
    scopes: [Scope.SETTINGS],
    description: 'Close settings',
    group: 'Navigation',
  },

  // Creation actions
  {
    action: Action.CREATE,
    keys: 'c',
    scopes: [Scope.KANBAN],
    description: 'Create new task',
    group: 'Kanban',
  },
  {
    action: Action.CREATE,
    keys: 'c',
    scopes: [Scope.PROJECTS],
    description: 'Create new project',
    group: 'Projects',
  },

  // Submit actions
  {
    action: Action.SUBMIT,
    keys: 'enter',
    scopes: [Scope.DIALOG],
    description: 'Submit form or confirm action',
    group: 'Dialog',
  },

  // Navigation actions
  {
    action: Action.FOCUS_SEARCH,
    keys: 'slash',
    scopes: [Scope.KANBAN],
    description: 'Focus search',
    group: 'Navigation',
  },
  {
    action: Action.NAV_UP,
    keys: 'k',
    scopes: [Scope.KANBAN],
    description: 'Move up within column',
    group: 'Navigation',
  },
  {
    action: Action.NAV_DOWN,
    keys: 'j',
    scopes: [Scope.KANBAN],
    description: 'Move down within column',
    group: 'Navigation',
  },
  {
    action: Action.NAV_LEFT,
    keys: 'h',
    scopes: [Scope.KANBAN],
    description: 'Move to previous column',
    group: 'Navigation',
  },
  {
    action: Action.NAV_RIGHT,
    keys: 'l',
    scopes: [Scope.KANBAN],
    description: 'Move to next column',
    group: 'Navigation',
  },
  {
    action: Action.OPEN_DETAILS,
    keys: ['meta+enter', 'ctrl+enter'],
    scopes: [Scope.KANBAN],
    description:
      'Open details; when open, cycle views forward (attempt → preview → diffs)',
    group: 'Navigation',
  },
  {
    action: Action.CYCLE_VIEW_BACKWARD,
    keys: ['meta+shift+enter', 'ctrl+shift+enter'],
    scopes: [Scope.KANBAN],
    description: 'Cycle views backward (diffs → preview → attempt)',
    group: 'Navigation',
  },

  // Global actions
  {
    action: Action.SHOW_HELP,
    keys: 'shift+slash',
    scopes: [Scope.GLOBAL],
    description: 'Show keyboard shortcuts help',
    group: 'Global',
  },

  // Task actions
  {
    action: Action.DELETE_TASK,
    keys: 'd',
    scopes: [Scope.KANBAN],
    description: 'Delete selected task',
    group: 'Task Details',
  },

  // Approval actions
  {
    action: Action.APPROVE_REQUEST,
    keys: 'enter',
    scopes: [Scope.APPROVALS],
    description: 'Approve pending approval request',
    group: 'Approvals',
  },
  {
    action: Action.DENY_APPROVAL,
    keys: ['meta+enter', 'ctrl+enter'],
    scopes: [Scope.APPROVALS],
    description: 'Deny pending approval request',
    group: 'Approvals',
  },

  // Follow-up actions
  {
    action: Action.SUBMIT_FOLLOW_UP,
    keys: 'meta+enter',
    scopes: [Scope.FOLLOW_UP_READY],
    description: 'Send or queue follow-up (depending on state)',
    group: 'Follow-up',
  },
  {
    action: Action.SUBMIT_TASK,
    keys: ['meta+enter', 'ctrl+enter'],
    scopes: [Scope.DIALOG],
    description: 'Submit task form (Create & Start or Update)',
    group: 'Dialog',
  },
  {
    action: Action.SUBMIT_TASK_ALT,
    keys: ['meta+shift+enter', 'ctrl+shift+enter'],
    scopes: [Scope.DIALOG],
    description: 'Submit task form (Create Task)',
    group: 'Dialog',
  },
  {
    action: Action.SUBMIT_COMMENT,
    keys: ['meta+enter', 'ctrl+enter'],
    scopes: [Scope.EDIT_COMMENT],
    description: 'Submit review comment',
    group: 'Comments',
  },

  // Sidebar navigation actions
  {
    action: Action.TOGGLE_SIDEBAR,
    keys: ['meta+backslash', 'ctrl+backslash'],
    scopes: [Scope.GLOBAL],
    description: 'Toggle sidebar',
    group: 'Sidebar',
  },
  {
    action: Action.GO_INBOX,
    keys: 'g i',
    scopes: [Scope.GLOBAL],
    description: 'Go to Inbox',
    group: 'Sidebar',
  },
  {
    action: Action.GO_MY_ISSUES,
    keys: 'g m',
    scopes: [Scope.GLOBAL],
    description: 'Go to My Issues',
    group: 'Sidebar',
  },
  {
    action: Action.GO_PROJECTS,
    keys: 'g p',
    scopes: [Scope.GLOBAL],
    description: 'Go to Projects',
    group: 'Sidebar',
  },
  {
    action: Action.COMMAND_PALETTE,
    keys: ['meta+k', 'ctrl+k'],
    scopes: [Scope.GLOBAL],
    description: 'Open command palette / search',
    group: 'Global',
  },
];

/**
 * Get keyboard bindings for a specific action and scope
 */
export function getKeysFor(action: Action, scope?: Scope): string[] {
  const bindings = keyBindings
    .filter(
      (binding) =>
        binding.action === action &&
        (!scope || !binding.scopes || binding.scopes.includes(scope))
    )
    .flatMap((binding) =>
      Array.isArray(binding.keys) ? binding.keys : [binding.keys]
    );

  return bindings;
}

/**
 * Get binding info for a specific action and scope
 */
export function getBindingFor(
  action: Action,
  scope?: Scope
): KeyBinding | undefined {
  return keyBindings.find(
    (binding) =>
      binding.action === action &&
      (!scope || !binding.scopes || binding.scopes.includes(scope))
  );
}
