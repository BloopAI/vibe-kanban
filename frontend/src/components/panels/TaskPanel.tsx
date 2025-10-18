import { useTranslation } from 'react-i18next';
import { useProject } from '@/contexts/project-context';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useNavigateWithSearch } from '@/hooks';
import { paths } from '@/lib/paths';
import type { TaskWithAttemptStatus } from 'shared/types';
import { NewCardContent } from '../ui/new-card';
import { Button } from '../ui/button';
import { PlusIcon } from 'lucide-react';
import NiceModal from '@ebay/nice-modal-react';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

interface TaskPanelProps {
  task: TaskWithAttemptStatus | null;
}

const TaskPanel = ({ task }: TaskPanelProps) => {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();

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
    return (
      <div className="text-muted-foreground">
        {t('taskPanel.noTaskSelected')}
      </div>
    );
  }

  const titleContent = `# ${task.title || 'Task'}`;
  const descriptionContent = task.description || '';

  return (
    <>
      <NewCardContent>
        <div className="p-6 flex flex-col h-full max-h-[calc(100vh-8rem)]">
          <div className="space-y-3 overflow-y-auto flex-shrink min-h-0">
            <MarkdownRenderer content={titleContent} />
            {descriptionContent && (
              <MarkdownRenderer content={descriptionContent} />
            )}
          </div>

          <div className="mt-6 flex-shrink-0">
            {isAttemptsLoading && (
              <div className="text-muted-foreground">
                {t('taskPanel.loadingAttempts')}
              </div>
            )}
            {isAttemptsError && (
              <div className="text-destructive">
                {t('taskPanel.errorLoadingAttempts')}
              </div>
            )}
            {!isAttemptsLoading && !isAttemptsError && (
              <table className="w-full text-sm">
                <thead className="uppercase text-muted-foreground">
                  <tr>
                    <th colSpan={3}>
                      <div className="w-full flex text-left">
                        <span className="flex-1">
                          {t('taskPanel.attemptsCount', {
                            count: displayedAttempts.length,
                          })}
                        </span>
                        <span>
                          <Button
                            variant="icon"
                            onClick={() =>
                              NiceModal.show('create-attempt', {
                                taskId: task.id,
                                latestAttempt,
                              })
                            }
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
                        {t('taskPanel.noAttempts')}
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
        </div>
      </NewCardContent>
    </>
  );
};

export default TaskPanel;
