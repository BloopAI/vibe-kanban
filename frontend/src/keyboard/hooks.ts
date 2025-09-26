import { createSemanticHook } from './useSemanticKey';
import { Action } from './registry';

/**
 * Semantic keyboard shortcut hooks
 *
 * These hooks provide a clean, semantic interface for common keyboard actions.
 * All key bindings are centrally managed in the registry.
 */

/**
 * Exit/Close action - typically Esc key
 *
 * @example
 * // In a dialog
 * useKeyExit(() => closeDialog(), { scope: Scope.DIALOG });
 *
 * @example
 * // In kanban board
 * useKeyExit(() => navigateToProjects(), { scope: Scope.KANBAN });
 */
export const useKeyExit = createSemanticHook(Action.EXIT);

/**
 * Create action - typically 'c' key
 *
 * @example
 * // Create new task
 * useKeyCreate(() => openTaskForm(), { scope: Scope.KANBAN });
 *
 * @example
 * // Create new project
 * useKeyCreate(() => openProjectForm(), { scope: Scope.PROJECTS });
 */
export const useKeyCreate = createSemanticHook(Action.CREATE);

/**
 * Submit action - typically Enter key
 *
 * @example
 * // Submit form in dialog
 * useKeySubmit(() => submitForm(), { scope: Scope.DIALOG });
 */
export const useKeySubmit = createSemanticHook(Action.SUBMIT);

/**
 * Focus search action - typically '/' key
 *
 * @example
 * useKeyFocusSearch(() => focusSearchInput(), { scope: Scope.KANBAN });
 */
export const useKeyFocusSearch = createSemanticHook(Action.FOCUS_SEARCH);

/**
 * Navigation actions - arrow keys and vim keys (hjkl)
 */
export const useKeyNavUp = createSemanticHook(Action.NAV_UP);
export const useKeyNavDown = createSemanticHook(Action.NAV_DOWN);
export const useKeyNavLeft = createSemanticHook(Action.NAV_LEFT);
export const useKeyNavRight = createSemanticHook(Action.NAV_RIGHT);

/**
 * Open details action - typically Enter key
 *
 * @example
 * useKeyOpenDetails(() => openTaskDetails(), { scope: Scope.KANBAN });
 */
export const useKeyOpenDetails = createSemanticHook(Action.OPEN_DETAILS);

/**
 * Show help action - typically '?' key
 *
 * @example
 * useKeyShowHelp(() => openHelpDialog(), { scope: Scope.GLOBAL });
 */
export const useKeyShowHelp = createSemanticHook(Action.SHOW_HELP);

/**
 * Toggle fullscreen action - typically Cmd+Enter key
 *
 * @example
 * useKeyToggleFullscreen(() => toggleFullscreen(), { scope: Scope.TASK_PANEL });
 */
export const useKeyToggleFullscreen = createSemanticHook(
  Action.TOGGLE_FULLSCREEN
);

/**
 * Delete task action - typically 'd' key
 *
 * @example
 * useKeyDeleteTask(() => handleDeleteTask(selectedTask), { scope: Scope.KANBAN });
 */
export const useKeyDeleteTask = createSemanticHook(Action.DELETE_TASK);

/**
 * Approve pending approval action - typically Enter key
 *
 * @example
 * useKeyApproveRequest(() => approvePendingRequest(), { scope: Scope.APPROVALS });
 */
export const useKeyApproveRequest = createSemanticHook(Action.APPROVE_REQUEST);

/**
 * Deny pending approval action - typically Cmd/Ctrl+Enter
 *
 * @example
 * useKeyDenyApproval(() => denyPendingRequest(), { scope: Scope.GLOBAL });
 */
export const useKeyDenyApproval = createSemanticHook(Action.DENY_APPROVAL);
