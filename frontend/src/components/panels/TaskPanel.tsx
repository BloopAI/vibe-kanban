import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '@/contexts/project-context';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { paths } from '@/lib/paths';
import type { TaskWithAttemptStatus } from 'shared/types';
import { NewCardContent } from '../ui/new-card';
import { Button } from '../ui/button';
import { PlusIcon } from 'lucide-react';
import { CreateAttemptDialog } from '../dialogs/tasks/CreateAttemptDialog';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

interface TaskPanelProps {
  task: TaskWithAttemptStatus | null;
}

const TaskPanel = ({ task }: TaskPanelProps) => {
  const navigate = useNavigate();
  const { projectId } = useProject();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

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

  const latestAttempt = displayedAttempts[0] ?? null;

  if (!task) {
    return <div className="text-muted-foreground">No task selected</div>;
  }

  const titleContent = `# ${task.title || 'Task'}`;
  const descriptionContent = task.description || '';

  return (
    <>
      <NewCardContent>
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <MarkdownRenderer content={titleContent} />
            {descriptionContent && (
              <MarkdownRenderer content={descriptionContent} />
            )}
          </div>

          {isAttemptsLoading && (
            <div className="text-muted-foreground">Loading attempts...</div>
          )}
          {isAttemptsError && (
            <div className="text-destructive">Failed to load attempts</div>
          )}
          {!isAttemptsLoading && !isAttemptsError && (
            <table className="w-full text-sm">
              <thead className="uppercase text-muted-foreground">
                <tr>
                  <th colSpan={3}>
                    <div className="w-full flex text-left">
                      <span className="flex-1">
                        Attempts ({displayedAttempts.length})
                      </span>
                      <span>
                        <Button
                          variant="icon"
                          onClick={() => setIsCreateDialogOpen(true)}
                        >
                          <PlusIcon size={16} />
                        </Button>
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedAttempts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-2 text-muted-foreground border-t"
                    >
                      No attempts yet
                    </td>
                  </tr>
                ) : (
                  displayedAttempts.map((attempt) => (
                    <tr
                      key={attempt.id}
                      className="border-t cursor-pointer hover:bg-muted"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (projectId && task.id && attempt.id) {
                          navigate(
                            paths.attempt(projectId, task.id, attempt.id)
                          );
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
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </NewCardContent>
      <CreateAttemptDialog
        taskId={task.id}
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        latestAttempt={latestAttempt}
      />
    </>
  );
};

export default TaskPanel;
