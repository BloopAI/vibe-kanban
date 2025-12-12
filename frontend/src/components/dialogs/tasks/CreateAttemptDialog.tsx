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
import RepoBranchSelector from '@/components/tasks/RepoBranchSelector';
import { ExecutorProfileSelector } from '@/components/settings';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import {
  useNavigateWithSearch,
  useTask,
  useAttempt,
  useRepoBranchSelection,
  useTaskAttempts,
} from '@/hooks';
import { useProject } from '@/contexts/ProjectContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { paths } from '@/lib/paths';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import type { ExecutorProfileId, BaseCodingAgent } from 'shared/types';
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

    const {
      configs: repoBranchConfigs,
      projectRepos,
      isLoading: isLoadingBranches,
      setRepoBranch,
      getAttemptRepoInputs,
      reset: resetBranchSelection,
    } = useRepoBranchSelection({
      projectId,
      initialBranch: parentAttempt?.branch,
      enabled: modal.visible,
    });

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
        resetBranchSelection();
      }
    }, [modal.visible, resetBranchSelection]);

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

    const effectiveProfile = userSelectedProfile ?? defaultProfile;

    const isLoadingInitial =
      isLoadingBranches ||
      isLoadingAttempts ||
      isLoadingTask ||
      isLoadingParent;

    const allBranchesSelected = repoBranchConfigs.every(
      (c) => c.targetBranch !== null
    );

    const canCreate = Boolean(
      effectiveProfile &&
        allBranchesSelected &&
        projectRepos.length > 0 &&
        !isCreating &&
        !isLoadingInitial
    );

    const handleCreate = async () => {
      if (
        !effectiveProfile ||
        !allBranchesSelected ||
        projectRepos.length === 0
      )
        return;
      try {
        const repos = getAttemptRepoInputs();

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

            <RepoBranchSelector
              configs={repoBranchConfigs}
              onBranchChange={setRepoBranch}
              isLoading={isLoadingBranches}
              className="space-y-2"
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
