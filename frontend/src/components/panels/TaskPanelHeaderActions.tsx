import { Button } from '../ui/button';
import { X } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/actions-dropdown';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';

type Task = TaskWithAttemptStatus;

interface TaskPanelHeaderActionsProps {
  task: Task;
  sharedTask?: SharedTaskRecord;
  onClose: () => void;
  projectId?: string;
}

export const TaskPanelHeaderActions = ({
  task,
  sharedTask,
  onClose,
  projectId,
}: TaskPanelHeaderActionsProps) => {
  return (
    <>
      <ActionsDropdown task={task} sharedTask={sharedTask} projectId={projectId} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
