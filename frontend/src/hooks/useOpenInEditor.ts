import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import { EditorSelectionDialog } from '@/components/dialogs/tasks/EditorSelectionDialog';
import { EditorType, type EditorOpenError } from 'shared/types';

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
        const response = await attemptsApi.openEditor(attemptId, {
          editor_type: editorType ?? null,
          file_path: filePath ?? null,
        });

        // If a URL is returned, open it in a new window/tab
        if (response.url) {
          window.open(response.url, '_blank');
        }
      } catch (err) {
        console.error('Failed to open editor:', err);

        // Handle executable not found error
        const errorData = (err as { error_data?: EditorOpenError })?.error_data;
        if (errorData?.type === 'executable_not_found') {
          const installUrl = errorData.install_url;
          if (installUrl) {
            if (
              window.confirm(
                `Editor executable '${errorData.executable}' not found. Would you like to open the installation page?`
              )
            ) {
              window.open(installUrl, '_blank');
            }
            return;
          }
        }

        if (!editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            EditorSelectionDialog.show({
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
