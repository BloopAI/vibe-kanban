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
import type { TaskWithAttemptStatus } from 'shared/types';
import type { Workspace } from 'shared/types';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import { DeleteTaskConfirmationDialog } from '@/components/dialogs/tasks/DeleteTaskConfirmationDialog';
import { ViewProcessesDialog } from '@/components/dialogs/tasks/ViewProcessesDialog';
import { ViewRelatedTasksDialog } from '@/components/dialogs/tasks/ViewRelatedTasksDialog';
import { CreateAttemptDialog } from '@/components/dialogs/tasks/CreateAttemptDialog';
import { GitActionsDialog } from '@/components/dialogs/tasks/GitActionsDialog';
import { EditBranchNameDialog } from '@/components/dialogs/tasks/EditBranchNameDialog';
import { ShareDialog } from '@/components/dialogs/tasks/ShareDialog';
import { ReassignDialog } from '@/components/dialogs/tasks/ReassignDialog';
import { StopShareTaskDialog } from '@/components/dialogs/tasks/StopShareTaskDialog';
import { useProject } from '@/contexts/ProjectContext';
import { openTaskForm } from '@/lib/openTaskForm';

import { useNavigate } from 'react-router-dom';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { useAuth } from '@/hooks';

interface ActionsDropdownProps {
  task?: TaskWithAttemptStatus | null;
  attempt?: Workspace | null;
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
  const navigate = useNavigate();
  const { userId, isSignedIn } = useAuth();

  const hasAttemptActions = Boolean(attempt);
  const hasTaskActions = Boolean(task);
  const isShared = Boolean(sharedTask);
  const canEditShared = (!isShared && !task?.shared_task_id) || isSignedIn;

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId || !task) return;
    openTaskForm({ mode: 'edit', projectId, task });
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId || !task) return;
    openTaskForm({ mode: 'duplicate', projectId, initialTask: task });
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId || !task) return;
    try {
      await DeleteTaskConfirmationDialog.show({
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
    ViewProcessesDialog.show({ attemptId: attempt.id });
  };

  const handleViewRelatedTasks = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!attempt?.id || !projectId) return;
    ViewRelatedTasksDialog.show({
      attemptId: attempt.id,
      projectId,
      attempt,
      onNavigateToTask: (taskId: string) => {
        if (projectId) {
          navigate(`/projects/${projectId}/tasks/${taskId}/attempts/latest`);
        }
      },
    });
  };

  const handleCreateNewAttempt = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task?.id) return;
    CreateAttemptDialog.show({
      taskId: task.id,
    });
  };

  const handleCreateSubtask = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId || !attempt) return;
    const baseBranch = attempt.branch;
    if (!baseBranch) return;
    openTaskForm({
      mode: 'subtask',
      projectId,
      parentTaskAttemptId: attempt.id,
      initialBaseBranch: baseBranch,
    });
  };

  const handleGitActions = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!attempt?.id || !task) return;
    GitActionsDialog.show({
      attemptId: attempt.id,
      task,
    });
  };

  const handleEditBranchName = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!attempt?.id) return;
    EditBranchNameDialog.show({
      attemptId: attempt.id,
      currentBranchName: attempt.branch,
    });
  };
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task || isShared) return;
    ShareDialog.show({ task });
  };

  const handleReassign = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sharedTask) return;
    ReassignDialog.show({ sharedTask });
  };

  const handleStopShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sharedTask) return;
    StopShareTaskDialog.show({ sharedTask });
  };

  const canReassign =
    Boolean(task) &&
    Boolean(sharedTask) &&
    sharedTask?.assignee_user_id === userId;
  const canStopShare =
    Boolean(sharedTask) && sharedTask?.assignee_user_id === userId;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="icon"
            aria-label="Actions"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
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
              <DropdownMenuItem
                disabled={!attempt?.id}
                onClick={handleViewRelatedTasks}
              >
                {t('actionsMenu.viewRelatedTasks')}
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
              <DropdownMenuItem
                disabled={!attempt?.id}
                onClick={handleEditBranchName}
              >
                {t('actionsMenu.editBranchName')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {hasTaskActions && (
            <>
              <DropdownMenuLabel>{t('actionsMenu.task')}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!task || isShared}
                onClick={handleShare}
              >
                {t('actionsMenu.share')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canReassign}
                onClick={handleReassign}
              >
                {t('actionsMenu.reassign')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canStopShare}
                onClick={handleStopShare}
                className="text-destructive"
              >
                {t('actionsMenu.stopShare')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!projectId || !canEditShared}
                onClick={handleEdit}
              >
                {t('common:buttons.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!projectId} onClick={handleDuplicate}>
                {t('actionsMenu.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!projectId || !canEditShared}
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
