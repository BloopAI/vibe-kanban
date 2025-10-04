import { useEffect, useState } from 'react';
import TitleDescriptionEditor from '../ui/TitleDescriptionEditor';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useProject } from '@/contexts/project-context';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useTaskViewManager } from '@/hooks/useTaskViewManager';
import type { TaskWithAttemptStatus } from 'shared/types';
import { NewCardContent } from '../ui/new-card';
import { Button } from '../ui/button';
import { PlusIcon } from 'lucide-react';

interface TaskPanelProps {
  task: TaskWithAttemptStatus | null;
}

const TaskPanel = ({ task }: TaskPanelProps) => {
  const { projectId } = useProject();
  const { updateTask } = useTaskMutations(projectId);
  const { navigateToAttempt } = useTaskViewManager();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string>('');

  const {
    data: attempts = [],
    isLoading: isAttemptsLoading,
    isError: isAttemptsError,
  } = useTaskAttempts(task?.id);

  const formatTimeAgo = (iso: string) => {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const absSec = Math.round(Math.abs(diffMs) / 1000);

    const rtf =
      typeof Intl !== 'undefined' && (Intl as any).RelativeTimeFormat
        ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
        : null;

    const to = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
      rtf
        ? rtf.format(-value, unit)
        : `${value} ${unit}${value !== 1 ? 's' : ''} ago`;

    if (absSec < 60) return to(Math.round(absSec), 'second');
    const mins = Math.round(absSec / 60);
    if (mins < 60) return to(mins, 'minute');
    const hours = Math.round(mins / 60);
    if (hours < 24) return to(hours, 'hour');
    const days = Math.round(hours / 24);
    if (days < 30) return to(days, 'day');
    const months = Math.round(days / 30);
    if (months < 12) return to(months, 'month');
    const years = Math.round(months / 12);
    return to(years, 'year');
  };

  const displayedAttempts = [...attempts].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

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

    const handle = setTimeout(() => {
      updateTask.mutate({
        taskId: task.id,
        data: {
          title,
          description,
          status: task.status,
          parent_task_attempt: task.parent_task_attempt,
          image_ids: null,
        },
      });
    }, 500);

    return () => clearTimeout(handle);
  }, [title, description, task, updateTask]);

  if (!task) {
    return <div className="text-muted-foreground">No task selected</div>;
  }

  return (
    <>
      <NewCardContent>
        <div className="p-6 space-y-6">
          <TitleDescriptionEditor
            title={title}
            description={description}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
          />
          {isAttemptsLoading && (
            <div className="text-muted-foreground">Loading attempts...</div>
          )}
          {isAttemptsError && (
            <div className="text-destructive">Failed to load attempts</div>
          )}
          {!isAttemptsLoading && !isAttemptsError && (
            <>
              {displayedAttempts.length === 0 ? (
                <div className="text-muted-foreground">No attempts yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="uppercase text-muted-foreground">
                    <tr>
                      <th colSpan={3}>
                        <div className="w-full flex text-left">
                          <span className="flex-1">
                            Attempts ({displayedAttempts.length})
                          </span>
                          <span>
                            <Button variant="icon">
                              <PlusIcon size={16} />
                            </Button>
                          </span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAttempts.map((attempt) => (
                      <tr
                        key={attempt.id}
                        className="border-t cursor-pointer hover:bg-muted"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (projectId && task.id && attempt.id) {
                            navigateToAttempt(projectId, task.id, attempt.id, {
                              replace: false,
                            });
                          }
                        }}
                      >
                        <td className="py-2 pr-4">
                          {attempt.executor || 'Base Agent'}
                        </td>
                        <td className="py-2 pr-4">{attempt.branch || '—'}</td>
                        <td className="py-2 pr-0 text-right">
                          {formatTimeAgo(attempt.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </NewCardContent>
    </>
  );
};

export default TaskPanel;
