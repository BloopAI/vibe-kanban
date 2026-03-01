import { useCallback } from 'react';
import { useKanbanNavigation } from '@/shared/hooks/useKanbanNavigation';
import type { CreateModeInitialState } from '@/shared/types/createMode';
import { persistWorkspaceCreateDraft } from '@/shared/lib/workspaceCreateState';

export function useProjectWorkspaceCreateDraft() {
  const { projectId, openWorkspaceCreate } = useKanbanNavigation();

  const openWorkspaceCreateFromState = useCallback(
    async (
      initialState: CreateModeInitialState,
      options?: { issueId?: string | null }
    ): Promise<string | null> => {
      if (!projectId) return null;

      const draftId = await persistWorkspaceCreateDraft(
        initialState,
        crypto.randomUUID()
      );
      if (!draftId) {
        return null;
      }

      openWorkspaceCreate(draftId, {
        issueId: options?.issueId ?? initialState.linkedIssue?.issueId ?? null,
      });

      return draftId;
    },
    [projectId, openWorkspaceCreate]
  );

  return {
    openWorkspaceCreateFromState,
  };
}
