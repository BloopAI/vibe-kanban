import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RepoBranchSelector } from '@/components/tasks/RepoBranchSelector';
import { ExecutorProfileSelector } from '@/components/settings';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import {
  useNavigateWithSearch,
  useTask,
  useAttempt,
  useTaskAttempts,
} from '@/hooks';
import { useProject } from '@/contexts/ProjectContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { paths } from '@/lib/paths';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import type { ExecutorProfileId, BaseCodingAgent, RepoBranch } from 'shared/types';
import { useKeySubmitTask, Scope } from '@/keyboard';
import { useProjectBranches } from '@/hooks/useProjectBranches';

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
    const [userSelectedBranches, setUserSelectedBranches] = useState<Record<
      string,
      string
    > | null>(null);

    const { repositories, isLoading: isLoadingBranches } = useProjectBranches(
      projectId
    );

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

    useEffect(() => {
      if (!modal.visible) {
        setUserSelectedProfile(null);
        setUserSelectedBranches(null);
      }
    }, [modal.visible]);

    const defaultProfile: ExecutorProfileId | null = useMemo(() => {
      if (latestAttempt?.executor) {
        const lastExec = latestAttempt.executor as BaseCodingAgent;
        // If the last attempt used the same executor as the user's current preference,
        // we assume they want to use their preferred variant as well.
        // Otherwise, we default to the "default" variant (null) since we don't know
        // what variant they used last time (TaskAttempt doesn't store it).
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

    const defaultBranches: Record<string, string> = useMemo(() => {
      const result: Record<string, string> = {};
      for (const repo of repositories) {
        const currentBranch = repo.branches.find((b) => b.is_current)?.name;
        result[repo.repository_id] =
          parentAttempt?.branch ?? currentBranch ?? repo.branches[0]?.name ?? '';
      }
      return result;
    }, [repositories, parentAttempt?.branch]);

    const effectiveProfile = userSelectedProfile ?? defaultProfile;
    const effectiveBranches = userSelectedBranches ?? defaultBranches;

    const isLoadingInitial =
      isLoadingBranches ||
      isLoadingAttempts ||
      isLoadingTask ||
      isLoadingParent;
    const hasAllBranches =
      repositories.length > 0 &&
      repositories.every((repo) => effectiveBranches[repo.repository_id]);
    const canCreate = Boolean(
      effectiveProfile && hasAllBranches && !isCreating && !isLoadingInitial
    );

    const handleCreate = async () => {
      if (!effectiveProfile || !hasAllBranches) return;
      try {
        const baseBranches: RepoBranch[] = Object.entries(effectiveBranches).map(
          ([repo_id, branch]) => ({ repo_id, branch })
        );
        await createAttempt({
          profile: effectiveProfile,
          baseBranches,
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
        <DialogContent className="sm:max-w-[500px]">
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

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t('createAttemptDialog.baseBranches', 'Base branches')}{' '}
                <span className="text-destructive">*</span>
              </Label>
              <RepoBranchSelector
                repositories={repositories}
                selectedBranches={effectiveBranches}
                onBranchChange={(repoId, branch) =>
                  setUserSelectedBranches((prev) => ({
                    ...(prev ?? defaultBranches),
                    [repoId]: branch,
                  }))
                }
                disabled={isCreating}
              />
            </div>

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
