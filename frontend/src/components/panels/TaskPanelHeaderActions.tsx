import { Button } from '../ui/button';
import { X } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/ActionsDropdown';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';

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
  return (
    <>
      <ActionsDropdown task={task} sharedTask={sharedTask} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
