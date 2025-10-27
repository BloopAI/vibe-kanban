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
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { useAuth } from '@clerk/clerk-react';

interface ActionsDropdownProps {
  task?: TaskWithAttemptStatus | null;
  attempt?: TaskAttempt | null;
  sharedTask?: SharedTaskRecord;
}

export function ActionsDropdown({
  task,
  attempt,
  sharedTask,
}: ActionsDropdownProps) {
  const { t } = useTranslation('tasks');
  const { projectId } = useProject();
  const openInEditor = useOpenInEditor(attempt?.id);
  const { userId } = useAuth();

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

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task) return;
    NiceModal.show('share-task', { task });
  };

  const handleReassign = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sharedTask) return;
    NiceModal.show('reassign-shared-task', { sharedTask });
  };

  const canReassign =
    Boolean(task) &&
    Boolean(sharedTask) &&
    sharedTask?.assignee_user_id === userId;

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
              <DropdownMenuSeparator />
            </>
          )}

          {hasTaskActions && (
            <>
              <DropdownMenuLabel>{t('actionsMenu.task')}</DropdownMenuLabel>
              <DropdownMenuItem disabled={!task} onClick={handleShare}>
                {t('actionsMenu.share')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canReassign}
                onClick={handleReassign}
              >
                Reassign
              </DropdownMenuItem>
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
