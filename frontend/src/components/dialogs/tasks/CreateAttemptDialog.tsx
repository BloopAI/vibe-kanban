import { useState, useEffect } from 'react';
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
import { useProject } from '@/contexts/project-context';
import { useUserSystem } from '@/components/config-provider';
import { projectsApi } from '@/lib/api';
import type {
  GitBranch,
  ExecutorProfileId,
  TaskAttempt,
  BaseCodingAgent,
} from 'shared/types';

interface CreateAttemptDialogProps {
  taskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  latestAttempt?: TaskAttempt | null;
}

export function CreateAttemptDialog({
  taskId,
  open,
  onOpenChange,
  latestAttempt,
}: CreateAttemptDialogProps) {
  const { t } = useTranslation('tasks');
  const { projectId } = useProject();
  const { profiles, config } = useUserSystem();
  const { createAttempt, isCreating, error } = useAttemptCreation(taskId);

  const [selectedProfile, setSelectedProfile] =
    useState<ExecutorProfileId | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  useEffect(() => {
    if (open && projectId) {
      setIsLoadingBranches(true);
      projectsApi
        .getBranches(projectId)
        .then((result) => {
          setBranches(result);
        })
        .catch((err) => {
          console.error('Failed to load branches:', err);
        })
        .finally(() => {
          setIsLoadingBranches(false);
        });
    }
  }, [open, projectId]);

  useEffect(() => {
    if (!open) {
      setSelectedProfile(null);
      setSelectedBranch(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    setSelectedProfile((prev) => {
      if (prev) return prev;

      const fromAttempt: ExecutorProfileId | null = latestAttempt?.executor
        ? { executor: latestAttempt.executor as BaseCodingAgent, variant: null }
        : null;

      return fromAttempt ?? config?.executor_profile ?? null;
    });

    setSelectedBranch((prev) => {
      if (prev) return prev;
      return (
        latestAttempt?.target_branch ??
        branches.find((b) => b.is_current)?.name ??
        null
      );
    });
  }, [
    open,
    latestAttempt?.executor,
    latestAttempt?.target_branch,
    config?.executor_profile,
    branches,
  ]);

  const handleCreate = async () => {
    if (!selectedProfile || !selectedBranch) return;

    try {
      await createAttempt({
        profile: selectedProfile,
        baseBranch: selectedBranch,
      });
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to create attempt:', err);
    }
  };

  const canCreate = selectedProfile && selectedBranch && !isCreating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                selectedProfile={selectedProfile}
                onProfileSelect={setSelectedProfile}
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
              selectedBranch={selectedBranch}
              onBranchSelect={setSelectedBranch}
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
            onClick={() => onOpenChange(false)}
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
