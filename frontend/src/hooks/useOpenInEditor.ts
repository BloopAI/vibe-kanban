import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import NiceModal from '@ebay/nice-modal-react';
import { showError } from '@/lib/modals';
import i18n from '@/i18n';
import type { EditorType, OpenEditorError } from 'shared/types';

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
        const result = await attemptsApi.openEditor(
          attemptId,
          editorType,
          filePath
        );

        if (result === undefined && !editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            NiceModal.show('editor-selection', {
              selectedAttemptId: attemptId,
              filePath,
            });
          }
        }
      } catch (err: any) {
        console.error('Failed to open editor:', err);

        // Build localized error message
        const title = i18n.t('common:errors.cannotOpenEditor.title');
        let message: string;

        const data = err?.error_data as OpenEditorError | undefined;
        if (data?.type === 'ide_cli_not_found') {
          const ed = data.editor_type as EditorType;
          const cmd = data.cli_command;
          const summary = i18n.t('common:errors.ideCli.missing.summary', {
            cmd,
          });
          const instructions = i18n.t(
            `common:errors.ideCli.instructions.${ed}`,
            { cmd }
          );
          message = `${summary}\n\n${instructions}`;
        } else {
          message = err?.message || i18n.t('common:states.error');
        }

        await showError({ title, message });

        // If no editor type was specified, show editor selection dialog
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
