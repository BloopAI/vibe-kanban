import { useEffect, useState } from 'react';
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
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useBranchStatus, useAttemptExecution } from '@/hooks';
import { useProject } from '@/contexts/project-context';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { projectsApi } from '@/lib/api';
import type {
  GitBranch,
  TaskAttempt,
  TaskWithAttemptStatus,
} from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface GitActionsDialogProps {
  attemptId: string;
  task?: TaskWithAttemptStatus;
  projectId?: string;
}

interface GitActionsDialogContentProps {
  attempt: TaskAttempt;
  task: TaskWithAttemptStatus;
  projectId: string;
  branches: GitBranch[];
  gitError: string | null;
  setGitError: (error: string | null) => void;
}

function GitActionsDialogContent({
  attempt,
  task,
  projectId,
  branches,
  gitError,
  setGitError,
}: GitActionsDialogContentProps) {
  const { t } = useTranslation('tasks');
  const { data: branchStatus } = useBranchStatus(attempt.id);
  const { isAttemptRunning } = useAttemptExecution(attempt.id);

  const mergedPR = branchStatus?.merges?.find(
    (m) => m.type === 'pr' && m.pr_info?.status === 'merged'
  );

  if (mergedPR && mergedPR.type === 'pr') {
    return (
      <div className="space-y-4 py-4">
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {gitError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-destructive text-sm">
          {gitError}
        </div>
      )}
      <GitOperations
        selectedAttempt={attempt}
        task={task}
        projectId={projectId}
        branchStatus={branchStatus ?? null}
        branches={branches}
        isAttemptRunning={isAttemptRunning}
        setError={setGitError}
        selectedBranch={branchStatus?.target_branch_name ?? null}
        layout="vertical"
      />
    </div>
  );
}

export const GitActionsDialog = NiceModal.create<GitActionsDialogProps>(
  ({ attemptId, task, projectId: providedProjectId }) => {
    const modal = useModal();
    const { t } = useTranslation('tasks');
    const { project } = useProject();

    const effectiveProjectId = providedProjectId ?? project?.id;
    const { data: attempt } = useTaskAttempt(attemptId);

    const [branches, setBranches] = useState<GitBranch[]>([]);
    const [gitError, setGitError] = useState<string | null>(null);
    const [loadingBranches, setLoadingBranches] = useState(true);

    useEffect(() => {
      if (!effectiveProjectId) return;
      setLoadingBranches(true);
      projectsApi
        .getBranches(effectiveProjectId)
        .then(setBranches)
        .catch(() => setBranches([]))
        .finally(() => setLoadingBranches(false));
    }, [effectiveProjectId]);

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        modal.hide();
      }
    };

    const isLoading =
      !attempt || !effectiveProjectId || loadingBranches || !task;

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
            <ExecutionProcessesProvider key={attempt.id} attemptId={attempt.id}>
              <GitActionsDialogContent
                attempt={attempt}
                task={task}
                projectId={effectiveProjectId}
                branches={branches}
                gitError={gitError}
                setGitError={setGitError}
              />
            </ExecutionProcessesProvider>
          )}
        </DialogContent>
      </Dialog>
    );
  }
);
