import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import NiceModal from '@ebay/nice-modal-react';
import type { EditorType } from 'shared/types';

type OpenEditorOptions = {
  editorType?: EditorType;
  filePath?: string;
};

export function useOpenInEditor(
  attemptId?: string,
  onShowEditorDialog?: () => void
) {
  return useCallback(
    async (options?: OpenEditorOptions): Promise<void> => {
      if (!attemptId) return;

      const { editorType, filePath } = options ?? {};

      try {
        const response = await attemptsApi.openEditor(
          attemptId,
          editorType,
          filePath
        );

        // If a URL is returned, open it in a new window/tab
        if (response.url) {
          window.open(response.url, '_blank');
        }
      } catch (err) {
        console.error('Failed to open editor:', err);
        if (!editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            NiceModal.show('editor-selection', {
              selectedAttemptId: attemptId,
              filePath,
            });
          }
        }
      }
    },
    [attemptId, onShowEditorDialog]
  );
}
