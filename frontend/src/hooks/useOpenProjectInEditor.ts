import { useCallback } from 'react';
import { projectsApi } from '@/lib/api';
import NiceModal from '@ebay/nice-modal-react';
import type { EditorType, Project } from 'shared/types';

export function useOpenProjectInEditor(
  project: Project | null,
  onShowEditorDialog?: () => void
) {
  return useCallback(
    async (editorType?: EditorType) => {
      if (!project) return;

      try {
        await projectsApi.openEditor(project.id, editorType);
      } catch (err) {
        console.error('Failed to open project in editor:', err);
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
