import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Define available keyboard shortcuts
export interface KeyboardShortcut {
  key: string;
  description: string;
  action: (context?: KeyboardShortcutContext) => void;
  requiresModifier?: boolean;
  disabled?: boolean;
}

export interface KeyboardShortcutContext {
  navigate?: ReturnType<typeof useNavigate>;
  closeDialog?: () => void;
  openCreateTask?: () => void;
  currentPath?: string;
  hasOpenDialog?: boolean;
  location?: ReturnType<typeof useLocation>;
}

// Centralized shortcut definitions
export const createKeyboardShortcuts = (
  context: KeyboardShortcutContext
): Record<string, KeyboardShortcut> => ({
  Escape: {
    key: 'Escape',
    description: 'Go back or close dialog',
    action: () => {
      // If there's an open dialog, close it
      if (context.hasOpenDialog && context.closeDialog) {
        context.closeDialog();
        return;
      }

      // Otherwise, navigate back
      if (context.navigate) {
        const currentPath =
          context.currentPath || context.location?.pathname || '/';

        // Navigate back based on current path
        if (
          currentPath.includes('/tasks/') &&
          !currentPath.endsWith('/tasks')
        ) {
          // From task details, go back to project tasks
          const projectPath = currentPath.split('/tasks/')[0] + '/tasks';
          context.navigate(projectPath);
        } else if (
          currentPath.includes('/projects/') &&
          currentPath.includes('/tasks')
        ) {
          // From project tasks, go back to projects
          context.navigate('/projects');
        } else if (currentPath !== '/' && currentPath !== '/projects') {
          // Default: go to projects page
          context.navigate('/projects');
        }
      }
    },
  },
  KeyC: {
    key: 'c',
    description: 'Create new task',
    action: () => {
      if (context.openCreateTask) {
        context.openCreateTask();
      }
    },
  },
});

// Hook to register global keyboard shortcuts
export function useKeyboardShortcuts(context: KeyboardShortcutContext) {
  const shortcuts = createKeyboardShortcuts(context);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't trigger shortcuts when modifier keys are pressed (except for specific shortcuts)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const shortcut = shortcuts[event.code] || shortcuts[event.key];

      if (shortcut && !shortcut.disabled) {
        event.preventDefault();
        shortcut.action(context);
      }
    },
    [shortcuts, context]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return shortcuts;
}

// Hook for dialog-specific keyboard shortcuts
export function useDialogKeyboardShortcuts(onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}
