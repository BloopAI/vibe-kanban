import { useCallback } from 'react';
import { attemptsApi, relayApi } from '@/shared/lib/api';
import { EditorSelectionDialog } from '@/shared/dialogs/command-bar/EditorSelectionDialog';
import type { EditorType } from 'shared/types';
import { useAppRuntime } from '@/shared/hooks/useAppRuntime';
import { useCurrentAppDestination } from '@/shared/hooks/useCurrentAppDestination';
import { getDestinationHostId } from '@/shared/lib/routes/appNavigation';

type OpenEditorOptions = {
  editorType?: EditorType;
  filePath?: string;
};

export function useOpenInEditor(
  attemptId?: string,
  onShowEditorDialog?: () => void
) {
  const appRuntime = useAppRuntime();
  const currentDestination = useCurrentAppDestination();
  const hostId = getDestinationHostId(currentDestination);

  return useCallback(
    async (options?: OpenEditorOptions): Promise<void> => {
      if (!attemptId) return;

      const { editorType, filePath } = options ?? {};

      try {
        const response =
          appRuntime === 'local' && hostId
            ? await relayApi.openRemoteWorkspaceInEditor({
                host_id: hostId,
                workspace_id: attemptId,
                editor_type: editorType ?? null,
              })
            : await attemptsApi.openEditor(attemptId, {
                editor_type: editorType ?? null,
                file_path: filePath ?? null,
              });

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
            EditorSelectionDialog.show({
              selectedAttemptId: attemptId,
              filePath,
            });
          }
        }
      }
    },
    [appRuntime, attemptId, hostId, onShowEditorDialog]
  );
}
