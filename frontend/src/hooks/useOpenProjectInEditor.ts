import { useCallback } from 'react';
import { projectsApi } from '@/lib/api';
import { ProjectEditorSelectionDialog } from '@/components/dialogs/projects/ProjectEditorSelectionDialog';
import { EditorType, type EditorOpenError, type Project } from 'shared/types';

export function useOpenProjectInEditor(
  project: Project | null,
  onShowEditorDialog?: () => void
) {
  return useCallback(
    async (editorType?: EditorType) => {
      if (!project) return;

      try {
        const response = await projectsApi.openEditor(project.id, {
          editor_type: editorType ?? null,
          file_path: null,
        });

        // If a URL is returned, open it in a new window/tab
        if (response.url) {
          window.open(response.url, '_blank');
        }
      } catch (err) {
        console.error('Failed to open project in editor:', err);

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
            ProjectEditorSelectionDialog.show({
              selectedProject: project,
            });
          }
        }
      }
    },
    [project, onShowEditorDialog]
  );
}
