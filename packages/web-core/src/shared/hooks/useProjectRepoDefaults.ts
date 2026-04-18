import { scratchApi, ApiError } from '@/shared/lib/api';
import {
  ScratchType,
  type DraftWorkspaceRepo,
  type ProjectStatusConfigData,
  type ScratchPayload,
} from 'shared/types';

const SCRATCH_TYPE = ScratchType.PROJECT_REPO_DEFAULTS;

export interface ProjectLocalDefaults {
  repos: DraftWorkspaceRepo[];
  statuses: ProjectStatusConfigData[];
}

async function getProjectLocalDefaults(
  projectId: string
): Promise<ProjectLocalDefaults | null> {
  try {
    const scratch = await scratchApi.get(SCRATCH_TYPE, projectId);
    const payload = scratch.payload as ScratchPayload;
    if (payload?.type === 'PROJECT_REPO_DEFAULTS') {
      return {
        repos: payload.data.repos ?? [],
        statuses: payload.data.statuses ?? [],
      };
    }
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    console.error('[useProjectRepoDefaults] Failed to read defaults:', error);
    return null;
  }
}

async function saveProjectLocalDefaults(
  projectId: string,
  data: ProjectLocalDefaults
): Promise<void> {
  await scratchApi.update(SCRATCH_TYPE, projectId, {
    payload: {
      type: 'PROJECT_REPO_DEFAULTS',
      data: {
        repos: data.repos,
        statuses: data.statuses,
      },
    },
  });
}

/**
 * Read project repo defaults from scratch storage.
 * Returns null if no defaults have been saved for this project.
 */
export async function getProjectRepoDefaults(
  projectId: string
): Promise<DraftWorkspaceRepo[] | null> {
  const defaults = await getProjectLocalDefaults(projectId);
  return defaults?.repos ?? null;
}

/**
 * Save project repo defaults to scratch storage (upsert).
 */
export async function saveProjectRepoDefaults(
  projectId: string,
  repos: DraftWorkspaceRepo[]
): Promise<void> {
  const current = (await getProjectLocalDefaults(projectId)) ?? {
    repos: [],
    statuses: [],
  };
  await saveProjectLocalDefaults(projectId, {
    ...current,
    repos,
  });
}

export async function getProjectStatusDefaults(
  projectId: string
): Promise<ProjectStatusConfigData[] | null> {
  const defaults = await getProjectLocalDefaults(projectId);
  return defaults?.statuses ?? null;
}

export async function saveProjectStatusDefaults(
  projectId: string,
  statuses: ProjectStatusConfigData[]
): Promise<void> {
  const current = (await getProjectLocalDefaults(projectId)) ?? {
    repos: [],
    statuses: [],
  };
  await saveProjectLocalDefaults(projectId, {
    ...current,
    statuses,
  });
}

/**
 * Read project repo defaults and filter out repos that no longer exist.
 * Returns an empty array if no defaults are saved or all saved repos are stale.
 */
export async function getValidProjectRepoDefaults(
  projectId: string,
  availableRepoIds: Set<string>
): Promise<DraftWorkspaceRepo[]> {
  const defaults = await getProjectRepoDefaults(projectId);
  if (!defaults) {
    return [];
  }
  return defaults.filter((repo) => availableRepoIds.has(repo.repo_id));
}
