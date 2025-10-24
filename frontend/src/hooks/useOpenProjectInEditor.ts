import { useCallback } from 'react';
import { projectsApi } from '@/lib/api';
import NiceModal from '@ebay/nice-modal-react';
import { showError } from '@/lib/modals';
import i18n from '@/i18n';
import type { EditorType, OpenEditorError, Project } from 'shared/types';

export function useOpenProjectInEditor(
  project: Project | null,
  onShowEditorDialog?: () => void
) {
  return useCallback(
    async (editorType?: EditorType) => {
      if (!project) return;

      try {
        await projectsApi.openEditor(project.id, editorType);
      } catch (err: any) {
        console.error('Failed to open project in editor:', err);

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
            NiceModal.show('project-editor-selection', {
              selectedProject: project,
            });
          }
        }
      }
    },
    [project, onShowEditorDialog]
  );
}
