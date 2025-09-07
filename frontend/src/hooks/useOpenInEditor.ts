import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import NiceModal from '@ebay/nice-modal-react';
import type { EditorType, TaskAttempt } from 'shared/types';

export function useOpenInEditor(
  attempt: TaskAttempt | null,
  onShowEditorDialog?: () => void
) {
  return useCallback(
    async (editorType?: EditorType) => {
      if (!attempt) return;

      try {
        const result = await attemptsApi.openEditor(attempt.id, editorType);

        if (result === undefined && !editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            NiceModal.show('editor-selection', { selectedAttempt: attempt });
          }
        }
      } catch (err) {
        console.error('Failed to open editor:', err);
        if (!editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            NiceModal.show('editor-selection', { selectedAttempt: attempt });
          }
        }
      }
    },
    [attempt, onShowEditorDialog]
  );
}
