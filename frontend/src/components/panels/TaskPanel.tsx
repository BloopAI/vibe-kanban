import { useEffect, useState } from 'react';
import TitleDescriptionEditor from '../ui/TitleDescriptionEditor';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useProject } from '@/contexts/project-context';
import type { TaskWithAttemptStatus } from 'shared/types';
import { NewCardContent, NewCardHeader } from '../ui/new-card';

interface TaskPanelProps {
  task: TaskWithAttemptStatus | null;
}

const TaskPanel = ({ task }: TaskPanelProps) => {
  const { projectId } = useProject();
  const { updateTask } = useTaskMutations(projectId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Reset editor state when task changes
  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
  }, [task?.id]); // only reset when the task switches

  // Debounced save
  useEffect(() => {
    if (!task) return;

    const changed =
      title !== (task.title ?? '') ||
      (description ?? '') !== (task.description ?? '');

    if (!changed) return;

    setIsSaving(true);
    const handle = setTimeout(() => {
      updateTask.mutate(
        {
          taskId: task.id,
          data: {
            title,
            description,
            status: task.status,
            parent_task_attempt: task.parent_task_attempt,
            image_ids: null,
          },
        },
        {
          onSettled: () => setIsSaving(false),
        }
      );
    }, 500);

    return () => clearTimeout(handle);
  }, [title, description, task, updateTask]);

  if (!task) {
    return (
      <div className="text-sm text-muted-foreground">No task selected</div>
    );
  }

  return (
    <>
      <NewCardContent>
        <div className="p-6">
          <TitleDescriptionEditor
            title={title}
            description={description}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
          />
        </div>
      </NewCardContent>
      <NewCardHeader>Attempts</NewCardHeader>
    </>
  );
};

export default TaskPanel;
