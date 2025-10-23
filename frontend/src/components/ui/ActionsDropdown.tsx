import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import type { TaskWithAttemptStatus, TaskAttempt } from 'shared/types';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import NiceModal from '@ebay/nice-modal-react';
import { useProject } from '@/contexts/project-context';
import { openTaskForm } from '@/lib/openTaskForm';

interface ActionsDropdownProps {
  task?: TaskWithAttemptStatus | null;
  attempt?: TaskAttempt | null;
}

export function ActionsDropdown({ task, attempt }: ActionsDropdownProps) {
  const { t } = useTranslation('tasks');
  const { projectId } = useProject();
  const openInEditor = useOpenInEditor(attempt?.id);

  const hasAttemptActions = Boolean(attempt);
  const hasTaskActions = Boolean(task);

  const handleEdit = () => {
    if (!projectId || !task) return;
    openTaskForm({ projectId, task });
  };

  const handleDuplicate = () => {
    if (!projectId || !task) return;
    openTaskForm({ projectId, initialTask: task });
  };

  const handleDelete = async () => {
    if (!projectId || !task) return;
    try {
      await NiceModal.show('delete-task-confirmation', {
        task,
        projectId,
      });
    } catch {
      // User cancelled or error occurred
    }
  };

  const handleOpenInEditor = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!attempt?.id) return;
    openInEditor();
  };

  const handleViewProcesses = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!attempt?.id) return;
    NiceModal.show('view-processes', { attemptId: attempt.id });
  };

  const handleCreateNewAttempt = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task?.id) return;
    NiceModal.show('create-attempt', {
      taskId: task.id,
      latestAttempt: null,
    });
  };

  const handleCreateSubtask = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId || !attempt) return;
    openTaskForm({
      projectId,
      parentTaskAttemptId: attempt.id,
      initialBaseBranch: attempt.branch || attempt.target_branch,
    });
  };

  const handleGitActions = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!attempt?.id || !task) return;
    NiceModal.show('git-actions', {
      attemptId: attempt.id,
      task,
      projectId,
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="icon"
            aria-label="Actions"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {hasAttemptActions && (
            <>
              <DropdownMenuLabel>{t('actionsMenu.attempt')}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!attempt?.id}
                onClick={handleOpenInEditor}
              >
                {t('actionsMenu.openInIde')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!attempt?.id}
                onClick={handleViewProcesses}
              >
                {t('actionsMenu.viewProcesses')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateNewAttempt}>
                {t('actionsMenu.createNewAttempt')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!projectId || !attempt}
                onClick={handleCreateSubtask}
              >
                {t('actionsMenu.createSubtask')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!attempt?.id || !task}
                onClick={handleGitActions}
              >
                {t('actionsMenu.gitActions')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {hasTaskActions && (
            <>
              <DropdownMenuLabel>{t('actionsMenu.task')}</DropdownMenuLabel>
              <DropdownMenuItem disabled={!projectId} onClick={handleEdit}>
                {t('common:buttons.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!projectId} onClick={handleDuplicate}>
                {t('actionsMenu.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!projectId}
                onClick={handleDelete}
                className="text-destructive"
              >
                {t('common:buttons.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
