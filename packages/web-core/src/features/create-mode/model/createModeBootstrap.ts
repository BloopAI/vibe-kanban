import type {
  DraftWorkspaceData,
  DraftWorkspaceAttachment,
  ExecutorConfig,
  Repo,
} from 'shared/types';
import { repoApi } from '@/shared/lib/api';
import type {
  CreateModeInitialState,
  LinkedIssue,
} from '@/shared/types/createMode';

export interface BootstrapSelectedRepo {
  repo: Repo;
  targetBranch: string | null;
}

export interface CreateModeBootstrapData {
  message?: string;
  linkedIssue?: LinkedIssue | null;
  repos?: BootstrapSelectedRepo[];
  executorConfig?: ExecutorConfig | null;
  attachments?: DraftWorkspaceAttachment[];
}

export interface ResolveCreateModeBootstrapParams {
  seedState: CreateModeInitialState | null;
  scratchData?: DraftWorkspaceData;
  defaultExecutorConfig?: ExecutorConfig | null;
  isValidProfile: (config: ExecutorConfig | null) => boolean;
}

export interface ResolveCreateModeBootstrapResult {
  source: 'seed' | 'scratch' | 'fresh';
  data: CreateModeBootstrapData;
}

interface PreferredRepoInput {
  repo_id: string;
  target_branch: string | null;
}

export async function resolveBootstrapRepos(
  preferredRepos: PreferredRepoInput[]
): Promise<BootstrapSelectedRepo[]> {
  const reposById = new Map<string, Repo>();

  const missingRepoIds = preferredRepos
    .map((repo) => repo.repo_id)
    .filter((repoId) => !reposById.has(repoId));

  if (missingRepoIds.length > 0) {
    const fetchedRepos = await Promise.all(
      missingRepoIds.map(async (repoId) => {
        try {
          return await repoApi.getById(repoId);
        } catch {
          return null;
        }
      })
    );

    for (const repo of fetchedRepos) {
      if (repo) {
        reposById.set(repo.id, repo);
      }
    }
  }

  return preferredRepos.flatMap((preferredRepo) => {
    const repo = reposById.get(preferredRepo.repo_id);
    if (!repo) return [];

    return [
      {
        repo,
        targetBranch: preferredRepo.target_branch ?? null,
      },
    ];
  });
}

export async function resolveCreateModeBootstrap({
  seedState,
  scratchData,
  defaultExecutorConfig,
  isValidProfile,
}: ResolveCreateModeBootstrapParams): Promise<ResolveCreateModeBootstrapResult> {
  const hasInitialPrompt = !!seedState?.initialPrompt;
  const hasLinkedIssue = !!seedState?.linkedIssue;
  const hasPreferredRepos = (seedState?.preferredRepos?.length ?? 0) > 0;
  const hasExecutorConfig = !!seedState?.executorConfig;

  if (
    hasInitialPrompt ||
    hasLinkedIssue ||
    hasPreferredRepos ||
    hasExecutorConfig
  ) {
    const data: CreateModeBootstrapData = {};
    let appliedSeedState = false;

    if (hasInitialPrompt) {
      data.message = seedState!.initialPrompt!;
      appliedSeedState = true;
    }

    if (hasLinkedIssue) {
      data.linkedIssue = seedState!.linkedIssue!;
      appliedSeedState = true;
    }

    if (seedState?.preferredRepos && seedState.preferredRepos.length > 0) {
      const resolvedRepos = await resolveBootstrapRepos(
        seedState.preferredRepos
      );
      if (resolvedRepos.length > 0) {
        data.repos = resolvedRepos;
        appliedSeedState = true;
      }
    }

    if (seedState?.executorConfig && isValidProfile(seedState.executorConfig)) {
      data.executorConfig = seedState.executorConfig;
      appliedSeedState = true;
    }

    if (appliedSeedState) {
      return {
        source: 'seed',
        data,
      };
    }
  }

  if (scratchData) {
    const data: CreateModeBootstrapData = {};

    if (scratchData.message) {
      data.message = scratchData.message;
    }

    if (
      scratchData.executor_config &&
      isValidProfile(scratchData.executor_config)
    ) {
      data.executorConfig = scratchData.executor_config;
    }

    if (scratchData.linked_issue) {
      data.linkedIssue = {
        issueId: scratchData.linked_issue.issue_id,
        simpleId: scratchData.linked_issue.simple_id || undefined,
        title: scratchData.linked_issue.title || undefined,
        remoteProjectId: scratchData.linked_issue.remote_project_id,
      };
    }

    if (scratchData.attachments?.length > 0) {
      data.attachments = scratchData.attachments;
    }

    if (scratchData.repos?.length > 0) {
      const restoredRepos = await resolveBootstrapRepos(
        scratchData.repos.map((repo) => ({
          repo_id: repo.repo_id,
          target_branch: repo.target_branch ?? null,
        }))
      );

      if (restoredRepos.length > 0) {
        data.repos = restoredRepos;
      }
    }

    return {
      source: 'scratch',
      data,
    };
  }

  return {
    source: 'fresh',
    data:
      defaultExecutorConfig && isValidProfile(defaultExecutorConfig)
        ? { executorConfig: defaultExecutorConfig }
        : {},
  };
}
