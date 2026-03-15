import { useCallback } from 'react';
import { workspacesApi, relayApi } from '@/shared/lib/api';
import { EditorSelectionDialog } from '@/shared/dialogs/command-bar/EditorSelectionDialog';
import type { EditorType } from 'shared/types';
import { useAppRuntime } from '@/shared/hooks/useAppRuntime';
import { useHostId } from '@/shared/providers/HostIdProvider';

type OpenEditorOptions = {
  editorType?: EditorType;
  filePath?: string;
};

export function useOpenInEditor(
  workspaceId?: string,
  onShowEditorDialog?: () => void
) {
  const appRuntime = useAppRuntime();
  const hostId = useHostId();

  return useCallback(
    async (options?: OpenEditorOptions): Promise<void> => {
      if (!workspaceId) return;

      const { editorType, filePath } = options ?? {};

      try {
        const response =
          appRuntime === 'local' && hostId
            ? await relayApi.openRemoteWorkspaceInEditor({
                host_id: hostId,
                workspace_id: workspaceId,
                editor_type: editorType ?? null,
                file_path: filePath ?? null,
              })
            : await workspacesApi.openEditor(workspaceId, {
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
              selectedAttemptId: workspaceId,
              filePath,
            });
          }
        }
      }
    },
    [appRuntime, workspaceId, hostId, onShowEditorDialog]
  );
}
