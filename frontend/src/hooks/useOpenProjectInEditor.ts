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
        const response = await projectsApi.openEditor(project.id, editorType);

        // If a URL is returned, open it in a new window/tab
        if (response.url) {
          window.open(response.url, '_blank');
        }
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
