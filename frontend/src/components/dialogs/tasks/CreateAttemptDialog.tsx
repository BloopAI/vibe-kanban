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
import BranchSelector from '@/components/tasks/BranchSelector';
import { ExecutorProfileSelector } from '@/components/settings';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import { useNavigateWithSearch } from '@/hooks';
import { useProject } from '@/contexts/project-context';
import { useUserSystem } from '@/components/config-provider';
import { projectsApi, attemptsApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import type {
  GitBranch,
  ExecutorProfileId,
  TaskAttempt,
  BaseCodingAgent,
} from 'shared/types';

export interface CreateAttemptDialogProps {
  taskId: string;
  latestAttempt?: TaskAttempt | null;
  parentTaskAttemptId?: string | null;
}

export const CreateAttemptDialog = NiceModal.create<CreateAttemptDialogProps>(
  ({ taskId, latestAttempt, parentTaskAttemptId }) => {
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
    const [userSelectedBranch, setUserSelectedBranch] = useState<string | null>(
      null
    );

    const [branches, setBranches] = useState<GitBranch[]>([]);
    const [isLoadingBranches, setIsLoadingBranches] = useState(false);

    const [parentAttempt, setParentAttempt] = useState<TaskAttempt | null>(
      null
    );
    const [isLoadingParent, setIsLoadingParent] = useState(false);

    useEffect(() => {
      if (!modal.visible) {
        setUserSelectedProfile(null);
        setUserSelectedBranch(null);
        setBranches([]);
        setIsLoadingBranches(false);
        setParentAttempt(null);
        setIsLoadingParent(false);
        return;
      }

      if (!projectId) return;

      let alive = true;

      setIsLoadingBranches(true);
      projectsApi
        .getBranches(projectId)
        .then((result) => {
          if (alive) setBranches(result);
        })
        .catch((err) => {
          console.error('Failed to load branches:', err);
        })
        .finally(() => {
          if (alive) setIsLoadingBranches(false);
        });

      const hasParent = Boolean(parentTaskAttemptId);
      setIsLoadingParent(hasParent);
      if (hasParent && parentTaskAttemptId) {
        attemptsApi
          .get(parentTaskAttemptId)
          .then((attempt) => {
            if (alive) setParentAttempt(attempt);
          })
          .catch((err) => {
            console.error('Failed to load parent attempt:', err);
          })
          .finally(() => {
            if (alive) setIsLoadingParent(false);
          });
      } else {
        setParentAttempt(null);
        setIsLoadingParent(false);
      }

      return () => {
        alive = false;
      };
    }, [modal.visible, projectId, parentTaskAttemptId]);

    const defaultProfile: ExecutorProfileId | null = useMemo(() => {
      if (latestAttempt?.executor) {
        return {
          executor: latestAttempt.executor as BaseCodingAgent,
          variant: null,
        };
      }
      return config?.executor_profile ?? null;
    }, [latestAttempt?.executor, config?.executor_profile]);

    const currentBranchName: string | null = useMemo(() => {
      return branches.find((b) => b.is_current)?.name ?? null;
    }, [branches]);

    const defaultBranch: string | null = useMemo(() => {
      return (
        parentAttempt?.branch ??
        latestAttempt?.target_branch ??
        currentBranchName ??
        null
      );
    }, [parentAttempt?.branch, latestAttempt?.target_branch, currentBranchName]);

    const effectiveProfile = userSelectedProfile ?? defaultProfile;
    const effectiveBranch = userSelectedBranch ?? defaultBranch;

    const isLoading = isLoadingBranches || isLoadingParent;
    const canCreate = Boolean(
      effectiveProfile && effectiveBranch && !isCreating && !isLoading
    );

    const handleCreate = async () => {
      if (!effectiveProfile || !effectiveBranch) return;
      try {
        await createAttempt({
          profile: effectiveProfile,
          baseBranch: effectiveBranch,
        });
        modal.hide();
      } catch (err) {
        console.error('Failed to create attempt:', err);
      }
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) modal.hide();
    };

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
                {t('createAttemptDialog.baseBranch')}{' '}
                <span className="text-destructive">*</span>
              </Label>
              <BranchSelector
                branches={branches}
                selectedBranch={effectiveBranch}
                onBranchSelect={setUserSelectedBranch}
                placeholder={
                  isLoadingBranches
                    ? t('createAttemptDialog.loadingBranches')
                    : t('createAttemptDialog.selectBranch')
                }
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
