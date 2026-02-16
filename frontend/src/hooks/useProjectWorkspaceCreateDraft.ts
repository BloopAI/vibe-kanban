import { useCallback } from 'react';
import { ScratchType, type DraftWorkspaceData } from 'shared/types';
import { useKanbanNavigation } from '@/hooks/useKanbanNavigation';
import { scratchApi } from '@/lib/api';
import { generateUuid } from '@/lib/uuid';
import type { CreateModeInitialState } from '@/hooks/useCreateModeState';

export function useProjectWorkspaceCreateDraft() {
  const { projectId, openWorkspaceCreate } = useKanbanNavigation();

  const openWorkspaceCreateFromState = useCallback(
    async (
      initialState: CreateModeInitialState,
      options?: { issueId?: string | null }
    ): Promise<string | null> => {
      if (!projectId) return null;

      const draftId = generateUuid();

      const draftData: DraftWorkspaceData = {
        message: initialState.initialPrompt ?? '',
        project_id: initialState.project_id ?? null,
        repos:
          initialState.preferredRepos?.map((repo) => ({
            repo_id: repo.repo_id,
            target_branch: repo.target_branch ?? '',
          })) ?? [],
        selected_profile: null,
        linked_issue: initialState.linkedIssue
          ? {
              issue_id: initialState.linkedIssue.issueId,
              simple_id: initialState.linkedIssue.simpleId ?? '',
              title: initialState.linkedIssue.title ?? '',
              remote_project_id: initialState.linkedIssue.remoteProjectId,
            }
          : null,
      };

      try {
        await scratchApi.update(ScratchType.DRAFT_WORKSPACE, draftId, {
          payload: {
            type: 'DRAFT_WORKSPACE',
            data: draftData,
          },
        });
      } catch (error) {
        console.error('Failed to persist create-workspace draft:', error);
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
