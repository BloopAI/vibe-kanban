export enum Scope {
  GLOBAL = 'global',
  DIALOG = 'dialog',
  KANBAN = 'kanban',
  PROJECTS = 'projects',
  EDIT_COMMENT = 'edit-comment',
  APPROVALS = 'approvals',
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
  TOGGLE_FULLSCREEN = 'toggle_fullscreen',
  DELETE_TASK = 'delete_task',
  APPROVE_REQUEST = 'approve_request',
  DENY_APPROVAL = 'deny_approval',
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
    keys: 'enter',
    scopes: [Scope.KANBAN],
    description: 'Open selected task details',
    group: 'Kanban',
  },

  // Global actions
  {
    action: Action.SHOW_HELP,
    keys: 'shift+slash',
    scopes: [Scope.GLOBAL],
    description: 'Show keyboard shortcuts help',
    group: 'Global',
  },

  // Task panel actions
  {
    action: Action.TOGGLE_FULLSCREEN,
    keys: ['meta+enter', 'ctrl+enter'],
    scopes: [Scope.KANBAN],
    description: 'Toggle fullscreen view',
    group: 'Task Details',
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
