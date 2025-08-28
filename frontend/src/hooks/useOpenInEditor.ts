import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import { useEditorDialog } from '@/contexts/editor-dialog-context';
import type { EditorType, TaskAttempt } from 'shared/types';

export function useOpenInEditor(
  attempt: TaskAttempt | null,
  onShowEditorDialog?: () => void
) {
  const { showEditorDialog } = useEditorDialog();

  return useCallback(
    async (editorType?: EditorType) => {
      if (!attempt) return;

      try {
        const result = await attemptsApi.openEditor(attempt.id, editorType);

        if (result === undefined && !editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            showEditorDialog(attempt);
          }
        }
      } catch (err) {
        console.error('Failed to open editor:', err);
        if (!editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            showEditorDialog(attempt);
          }
        }
      }
    },
    [attempt, onShowEditorDialog, showEditorDialog]
  );
}
