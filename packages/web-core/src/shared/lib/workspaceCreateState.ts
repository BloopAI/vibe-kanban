import type { CreateModeInitialState } from '@/shared/types/createMode';
import type { DraftWorkspaceData } from 'shared/types';
import { ScratchType } from 'shared/types';
import { scratchApi } from '@/shared/lib/api';

interface WorkspaceDefaultsLike {
  preferredRepos?: CreateModeInitialState['preferredRepos'];
  project_id?: string | null;
}

interface LocalWorkspaceLike {
  id: string;
}

interface LinkedIssueSource {
  id: string;
  simple_id: string;
  title: string;
}

export const DEFAULT_WORKSPACE_CREATE_DRAFT_ID =
  '00000000-0000-0000-0000-000000000001';

export function buildWorkspaceCreatePrompt(
  title: string | null | undefined,
  description: string | null | undefined
): string | null {
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) return null;

  const trimmedDescription = description?.trim();
  return trimmedDescription
    ? `${trimmedTitle}\n\n${trimmedDescription}`
    : trimmedTitle;
}

export function buildLinkedIssueCreateState(
  issue: LinkedIssueSource | null | undefined,
  projectId: string
): NonNullable<CreateModeInitialState['linkedIssue']> | null {
  if (!issue) return null;
  return {
    issueId: issue.id,
    simpleId: issue.simple_id,
    title: issue.title,
    remoteProjectId: projectId,
  };
}

export function buildWorkspaceCreateInitialState(args: {
  prompt: string | null;
  defaults?: WorkspaceDefaultsLike | null;
  linkedIssue?: CreateModeInitialState['linkedIssue'];
}): CreateModeInitialState {
  return {
    initialPrompt: args.prompt,
    preferredRepos: args.defaults?.preferredRepos ?? null,
    project_id: args.defaults?.project_id ?? null,
    linkedIssue: args.linkedIssue ?? null,
  };
}

export function buildLocalWorkspaceIdSet(
  activeWorkspaces: LocalWorkspaceLike[],
  archivedWorkspaces: LocalWorkspaceLike[]
): Set<string> {
  return new Set([
    ...activeWorkspaces.map((workspace) => workspace.id),
    ...archivedWorkspaces.map((workspace) => workspace.id),
  ]);
}

export function toDraftWorkspaceData(
  initialState: CreateModeInitialState
): DraftWorkspaceData {
  return {
    message: initialState.initialPrompt ?? '',
    repos:
      initialState.preferredRepos?.map((repo) => ({
        repo_id: repo.repo_id,
        target_branch: repo.target_branch ?? '',
      })) ?? [],
    executor_config: null,
    linked_issue: initialState.linkedIssue
      ? {
          issue_id: initialState.linkedIssue.issueId,
          simple_id: initialState.linkedIssue.simpleId ?? '',
          title: initialState.linkedIssue.title ?? '',
          remote_project_id: initialState.linkedIssue.remoteProjectId,
        }
      : null,
    images: [],
  };
}

export async function persistWorkspaceCreateDraft(
  initialState: CreateModeInitialState,
  draftId = DEFAULT_WORKSPACE_CREATE_DRAFT_ID
): Promise<string | null> {
  const draftData = toDraftWorkspaceData(initialState);

  try {
    await scratchApi.update(ScratchType.DRAFT_WORKSPACE, draftId, {
      payload: {
        type: 'DRAFT_WORKSPACE',
        data: draftData,
      },
    });
    return draftId;
  } catch (error) {
    console.error('Failed to persist create-workspace draft:', error);
    return null;
  }
}
