import { useCallback } from 'react';
import { useTaskFormStore } from '@/stores/useTaskFormStore';
import { useKeySubmitTask, useKeySubmitTaskAlt, Scope } from '@/keyboard';

export function useTaskFormKeyboardShortcuts({
  mode,
  enabled,
  onSubmit,
  onCreateAndStart,
}: {
  mode: 'create' | 'edit';
  enabled: boolean;
  onSubmit: () => void;
  onCreateAndStart: () => void;
}) {
  const { isSubmitting, title, showDiscardWarning, autoStart } =
    useTaskFormStore();

  const primaryAction = useCallback(() => {
    if (isSubmitting || !title.trim()) return;

    if (mode === 'edit') {
      onSubmit();
    } else if (autoStart) {
      onCreateAndStart();
    } else {
      onSubmit();
    }
  }, [isSubmitting, title, mode, autoStart, onSubmit, onCreateAndStart]);

  const alternateAction = useCallback(() => {
    if (isSubmitting || !title.trim()) return;

    if (mode === 'edit') {
      onSubmit();
    } else if (autoStart) {
      onSubmit();
    } else {
      onCreateAndStart();
    }
  }, [isSubmitting, title, mode, autoStart, onSubmit, onCreateAndStart]);

  const shortcutsEnabled = enabled && !isSubmitting && !!title.trim() && !showDiscardWarning;

  useKeySubmitTask(primaryAction, {
    enabled: shortcutsEnabled,
    scope: Scope.DIALOG,
    enableOnFormTags: ['input', 'INPUT', 'textarea', 'TEXTAREA'],
    preventDefault: true,
  });

  useKeySubmitTaskAlt(alternateAction, {
    enabled: shortcutsEnabled,
    scope: Scope.DIALOG,
    enableOnFormTags: ['input', 'INPUT', 'textarea', 'TEXTAREA'],
    preventDefault: true,
  });
}
