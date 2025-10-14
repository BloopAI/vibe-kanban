import { Button } from '../ui/button';
import { X } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/ActionsDropdown';

type Task = TaskWithAttemptStatus;

interface TaskPanelHeaderActionsProps {
  task: Task;
  onClose: () => void;
}

export const TaskPanelHeaderActions = ({
  task,
  onClose,
}: TaskPanelHeaderActionsProps) => {
  return (
    <>
      <ActionsDropdown task={task} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
