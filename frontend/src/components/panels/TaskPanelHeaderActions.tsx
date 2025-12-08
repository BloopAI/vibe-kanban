import { Button } from '../ui/button';
import { X } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/actions-dropdown';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { useIsOrgAdmin } from '@/hooks';

type Task = TaskWithAttemptStatus;

interface TaskPanelHeaderActionsProps {
  task: Task;
  sharedTask?: SharedTaskRecord;
  onClose: () => void;
}

export const TaskPanelHeaderActions = ({
  task,
  sharedTask,
  onClose,
}: TaskPanelHeaderActionsProps) => {
  const isOrgAdmin = useIsOrgAdmin();

  return (
    <>
      <ActionsDropdown task={task} sharedTask={sharedTask} isOrgAdmin={isOrgAdmin} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
