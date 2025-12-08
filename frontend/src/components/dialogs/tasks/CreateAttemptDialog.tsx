import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExecutorProfileSelector } from '@/components/settings';
import {
  AttemptRepoSelector,
  BranchesByRepoPath,
} from '@/components/tasks/AttemptRepoSelector';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import {
  useNavigateWithSearch,
  useTask,
  useAttempt,
  useTaskAttempts,
} from '@/hooks';
import { repoBranchKeys } from '@/hooks/useRepoBranches';
import { useProject } from '@/contexts/ProjectContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { paths } from '@/lib/paths';
import { projectsApi, repoApi } from '@/lib/api';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import type {
  ExecutorProfileId,
  BaseCodingAgent,
  AttemptRepoInput,
} from 'shared/types';
import { useKeySubmitTask, Scope } from '@/keyboard';

export interface CreateAttemptDialogProps {
  taskId: string;
}

const CreateAttemptDialogImpl = NiceModal.create<CreateAttemptDialogProps>(
  ({ taskId }) => {
    const modal = useModal();
    const navigate = useNavigateWithSearch();
    const { projectId } = useProject();
    const { t } = useTranslation('tasks');
    const { profiles, config } = useUserSystem();
    const { createAttempt, isCreating, error } = useAttemptCreation({
      taskId,
      onSuccess: (attempt) => {
        if (projectId) {
          navigate(paths.attempt(projectId, taskId, attempt.id));
        }
      },
    });

    const [userSelectedProfile, setUserSelectedProfile] =
      useState<ExecutorProfileId | null>(null);
    const [repos, setRepos] = useState<AttemptRepoInput[]>([]);
    const [hasInitializedRepos, setHasInitializedRepos] = useState(false);

    const { data: projectRepos = [], isLoading: isLoadingProjectRepos } =
      useQuery({
        queryKey: ['projectRepositories', projectId],
        queryFn: () =>
          projectId
            ? projectsApi.getRepositories(projectId)
            : Promise.resolve([]),
        enabled: modal.visible && !!projectId,
      });

    const repoPaths = useMemo(() => repos.map((r) => r.git_repo_path), [repos]);

    const branchQueries = useQueries({
      queries: repoPaths.map((path) => ({
        queryKey: repoBranchKeys.byPath(path),
        queryFn: () => repoApi.getBranches(path),
        enabled: modal.visible && !!path,
        staleTime: 60_000,
      })),
    });

    const branchesByRepo = useMemo(() => {
      const result: BranchesByRepoPath = {};
      repoPaths.forEach((path, index) => {
        result[path] = branchQueries[index]?.data ?? [];
      });
      return result;
    }, [repoPaths, branchQueries]);

    const isLoadingBranches = branchQueries.some((q) => q.isLoading);

    const { data: attempts = [], isLoading: isLoadingAttempts } =
      useTaskAttempts(taskId, {
        enabled: modal.visible,
        refetchInterval: 5000,
      });

    const { data: task, isLoading: isLoadingTask } = useTask(taskId, {
      enabled: modal.visible,
    });

    const parentAttemptId = task?.parent_task_attempt ?? undefined;
    const { data: parentAttempt, isLoading: isLoadingParent } = useAttempt(
      parentAttemptId,
      { enabled: modal.visible && !!parentAttemptId }
    );

    const latestAttempt = useMemo(() => {
      if (attempts.length === 0) return null;
      return attempts.reduce((latest, attempt) =>
        new Date(attempt.created_at) > new Date(latest.created_at)
          ? attempt
          : latest
      );
    }, [attempts]);

    // Initialize repos from project defaults when data loads
    useEffect(() => {
      if (
        modal.visible &&
        !hasInitializedRepos &&
        !isLoadingProjectRepos &&
        projectRepos.length > 0
      ) {
        const defaultBranch = parentAttempt?.branch ?? 'main';
        const initialRepos: AttemptRepoInput[] = projectRepos.map((repo) => ({
          git_repo_path: repo.path.toString(),
          display_name: repo.display_name,
          target_branch: defaultBranch,
        }));
        setRepos(initialRepos);
        setHasInitializedRepos(true);
      }
    }, [
      modal.visible,
      hasInitializedRepos,
      isLoadingProjectRepos,
      projectRepos,
      parentAttempt?.branch,
    ]);

    useEffect(() => {
      if (!modal.visible) {
        setUserSelectedProfile(null);
        setRepos([]);
        setHasInitializedRepos(false);
      }
    }, [modal.visible]);

    const defaultProfile: ExecutorProfileId | null = useMemo(() => {
      if (latestAttempt?.executor) {
        const lastExec = latestAttempt.executor as BaseCodingAgent;
        const variant =
          config?.executor_profile?.executor === lastExec
            ? config.executor_profile.variant
            : null;

        return {
          executor: lastExec,
          variant,
        };
      }
      return config?.executor_profile ?? null;
    }, [latestAttempt?.executor, config?.executor_profile]);

    const effectiveProfile = userSelectedProfile ?? defaultProfile;

    const isLoadingInitial =
      isLoadingBranches ||
      isLoadingAttempts ||
      isLoadingTask ||
      isLoadingParent ||
      isLoadingProjectRepos;
    const canCreate = Boolean(
      effectiveProfile && repos.length > 0 && !isCreating && !isLoadingInitial
    );

    const handleCreate = async () => {
      if (!effectiveProfile || repos.length === 0) return;
      try {
        await createAttempt({
          profile: effectiveProfile,
          repos,
        });

        modal.hide();
      } catch (err) {
        console.error('Failed to create attempt:', err);
      }
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) modal.hide();
    };

    useKeySubmitTask(handleCreate, {
      enabled: modal.visible && canCreate,
      scope: Scope.DIALOG,
      preventDefault: true,
    });

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t('createAttemptDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('createAttemptDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {profiles && (
              <div className="space-y-2">
                <ExecutorProfileSelector
                  profiles={profiles}
                  selectedProfile={effectiveProfile}
                  onProfileSelect={setUserSelectedProfile}
                  showLabel={true}
                />
              </div>
            )}

            <AttemptRepoSelector
              repos={repos}
              branchesByRepo={branchesByRepo}
              onUpdate={setRepos}
              isLoading={isLoadingProjectRepos || isLoadingBranches}
            />

            {error && (
              <div className="text-sm text-destructive">
                {t('createAttemptDialog.error')}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => modal.hide()}
              disabled={isCreating}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!canCreate}>
              {isCreating
                ? t('createAttemptDialog.creating')
                : t('createAttemptDialog.start')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const CreateAttemptDialog = defineModal<CreateAttemptDialogProps, void>(
  CreateAttemptDialogImpl
);
