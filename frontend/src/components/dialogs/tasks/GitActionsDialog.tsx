import { useTranslation } from 'react-i18next';
import { ExternalLink, GitPullRequest } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader } from '@/components/ui/loader';
import GitOperations from '@/components/tasks/Toolbar/GitOperations';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useBranchStatus, useAttemptExecution } from '@/hooks';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import {
  GitOperationsProvider,
  useGitOperationsError,
} from '@/contexts/GitOperationsContext';
import type { Merge } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';

export interface GitActionsDialogProps {
  attemptId: string;
}

interface GitActionsDialogContentProps {
  attempt: WorkspaceWithSession;
}

function GitActionsDialogContent({ attempt }: GitActionsDialogContentProps) {
  const { t } = useTranslation('tasks');
  const { data: branchStatus, error: branchStatusError } = useBranchStatus(
    attempt.id
  );
  const { isAttemptRunning } = useAttemptExecution(attempt.id);
  const { error: gitError } = useGitOperationsError();
  const { repos, selectedRepoId } = useAttemptRepo(attempt.id);

  const getSelectedRepoStatus = () => {
    const repoId = selectedRepoId ?? repos[0]?.id;
    return branchStatus?.find((r) => r.repo_id === repoId);
  };

  const mergedPR = getSelectedRepoStatus()?.merges?.find(
    (m: Merge) => m.type === 'pr' && m.pr_info?.status === 'merged'
  );

  return (
    <div className="space-y-4">
      {mergedPR && mergedPR.type === 'pr' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {t('git.actions.prMerged', {
              number: mergedPR.pr_info.number || '',
            })}
          </span>
          {mergedPR.pr_info.url && (
            <a
              href={mergedPR.pr_info.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              {t('git.pr.number', {
                number: Number(mergedPR.pr_info.number),
              })}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
      {gitError && (
        <div className="p-3 border border-destructive rounded text-destructive text-sm">
          {gitError}
        </div>
      )}
      <GitOperations
        selectedAttempt={attempt}
        branchStatus={branchStatus ?? null}
        branchStatusError={branchStatusError}
        isAttemptRunning={isAttemptRunning}
        selectedBranch={getSelectedRepoStatus()?.target_branch_name ?? null}
        layout="vertical"
      />
    </div>
  );
}

const GitActionsDialogImpl = NiceModal.create<GitActionsDialogProps>(
  ({ attemptId }) => {
    const modal = useModal();
    const { t } = useTranslation('tasks');

    const { data: attempt } = useTaskAttemptWithSession(attemptId);

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        modal.hide();
      }
    };

    const isLoading = !attempt;

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('git.actions.title')}</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="py-8">
              <Loader size={24} />
            </div>
          ) : (
            <GitOperationsProvider attemptId={attempt.id}>
              <ExecutionProcessesProvider
                key={attempt.id}
                attemptId={attempt.id}
                sessionId={attempt.session?.id}
              >
                <GitActionsDialogContent attempt={attempt} />
              </ExecutionProcessesProvider>
            </GitOperationsProvider>
          )}
        </DialogContent>
      </Dialog>
    );
  }
);

export const GitActionsDialog = defineModal<GitActionsDialogProps, void>(
  GitActionsDialogImpl
);
