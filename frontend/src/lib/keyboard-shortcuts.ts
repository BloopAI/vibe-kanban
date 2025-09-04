import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ExecutorConfig } from 'shared/types';

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
  onC?: () => void;
  currentPath?: string;
  hasOpenDialog?: boolean;
  location?: ReturnType<typeof useLocation>;
  stopExecution?: () => void;
  newAttempt?: () => void;
  onEnter?: () => void;
  ignoreEscape?: boolean;
}

// Centralized shortcut definitions
export const createKeyboardShortcuts = (
  context: KeyboardShortcutContext
): Record<string, KeyboardShortcut> => ({
  Escape: {
    key: 'Escape',
    description: 'Go back or close dialog',
    action: () => {
      if (context.ignoreEscape) {
        return;
      }

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
  Enter: {
    key: 'Enter',
    description: 'Enter or submit',
    action: () => {
      if (context.onEnter) {
        context.onEnter();
      }
    },
  },
  KeyC: {
    key: 'c',
    description: 'Create new task',
    action: () => {
      if (context.onC) {
        context.onC();
      }
    },
  },
  KeyS: {
    key: 's',
    description: 'Stop all executions',
    action: () => {
      context.stopExecution && context.stopExecution();
    },
  },
  KeyN: {
    key: 'n',
    description: 'Create new task attempt',
    action: () => {
      context.newAttempt && context.newAttempt();
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

// Kanban board keyboard navigation hook
export function useKanbanKeyboardNavigation({
  focusedTaskId,
  setFocusedTaskId,
  focusedStatus,
  setFocusedStatus,
  groupedTasks,
  filteredTasks,
  allTaskStatuses,
  onViewTaskDetails,
  preserveIndexOnColumnSwitch = false,
}: {
  focusedTaskId: string | null;
  setFocusedTaskId: (id: string | null) => void;
  focusedStatus: string | null;
  setFocusedStatus: (status: string | null) => void;
  groupedTasks: Record<string, any[]>;
  filteredTasks: unknown[];
  allTaskStatuses: string[];
  onViewTaskDetails?: (task: any) => void;
  preserveIndexOnColumnSwitch?: boolean;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't handle if typing in input, textarea, or select
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;
      if (!focusedTaskId || !focusedStatus) return;
      const currentColumn = groupedTasks[focusedStatus];
      const currentIndex = currentColumn.findIndex(
        (t: any) => t.id === focusedTaskId
      );
      let newStatus = focusedStatus;
      let newTaskId = focusedTaskId;
      if (e.key === 'ArrowDown') {
        if (currentIndex < currentColumn.length - 1) {
          newTaskId = currentColumn[currentIndex + 1].id;
        }
      } else if (e.key === 'ArrowUp') {
        if (currentIndex > 0) {
          newTaskId = currentColumn[currentIndex - 1].id;
        }
      } else if (e.key === 'ArrowRight') {
        let colIdx = allTaskStatuses.indexOf(focusedStatus);
        while (colIdx < allTaskStatuses.length - 1) {
          colIdx++;
          const nextStatus = allTaskStatuses[colIdx];
          if (groupedTasks[nextStatus] && groupedTasks[nextStatus].length > 0) {
            newStatus = nextStatus;
            if (preserveIndexOnColumnSwitch) {
              const nextCol = groupedTasks[nextStatus];
              const idx = Math.min(currentIndex, nextCol.length - 1);
              newTaskId = nextCol[idx].id;
            } else {
              newTaskId = groupedTasks[nextStatus][0].id;
            }
            break;
          }
        }
      } else if (e.key === 'ArrowLeft') {
        let colIdx = allTaskStatuses.indexOf(focusedStatus);
        while (colIdx > 0) {
          colIdx--;
          const prevStatus = allTaskStatuses[colIdx];
          if (groupedTasks[prevStatus] && groupedTasks[prevStatus].length > 0) {
            newStatus = prevStatus;
            if (preserveIndexOnColumnSwitch) {
              const prevCol = groupedTasks[prevStatus];
              const idx = Math.min(currentIndex, prevCol.length - 1);
              newTaskId = prevCol[idx].id;
            } else {
              newTaskId = groupedTasks[prevStatus][0].id;
            }
            break;
          }
        }
      } else if ((e.key === 'Enter' || e.key === ' ') && onViewTaskDetails) {
        const task = filteredTasks.find((t: any) => t.id === focusedTaskId);
        if (task) {
          onViewTaskDetails(task);
        }
      } else {
        return;
      }
      e.preventDefault();
      setFocusedTaskId(newTaskId);
      setFocusedStatus(newStatus);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    focusedTaskId,
    focusedStatus,
    groupedTasks,
    filteredTasks,
    onViewTaskDetails,
    allTaskStatuses,
    setFocusedTaskId,
    setFocusedStatus,
    preserveIndexOnColumnSwitch,
  ]);
}

// Hook for cycling through profile variants with Left Shift + Tab
export function useVariantCyclingShortcut({
  currentProfile,
  selectedVariant,
  setSelectedVariant,
  setIsAnimating,
}: {
  currentProfile: ExecutorConfig | null | undefined;
  selectedVariant: string | null;
  setSelectedVariant: (variant: string | null) => void;
  setIsAnimating: (animating: boolean) => void;
}) {
  useEffect(() => {
    if (!currentProfile || Object.keys(currentProfile).length === 0) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Left Shift + Tab
      if (e.shiftKey && e.key === 'Tab') {
        e.preventDefault();

        // Build the variant cycle: variant1 → variant2 → ... → variant1
        const variants = currentProfile;
        const variantLabels = Object.keys(variants);

        // Find current index and cycle to next
        const currentIndex = variantLabels.findIndex(
          (v) => v === selectedVariant
        );
        const nextIndex = (currentIndex + 1) % variantLabels.length;
        const nextVariant = variantLabels[nextIndex];

        setSelectedVariant(nextVariant);

        // Trigger animation
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentProfile, selectedVariant, setSelectedVariant, setIsAnimating]);
}
