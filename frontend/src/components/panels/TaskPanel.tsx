import { useTranslation } from 'react-i18next';
import { useProject } from '@/contexts/ProjectContext';
import { useTaskAttemptsWithSessions } from '@/hooks/useTaskAttempts';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useSingleTaskProperties } from '@/hooks/useTaskProperties';
import { useNavigateWithSearch } from '@/hooks';
import { useUserSystem } from '@/components/ConfigProvider';
import { paths } from '@/lib/paths';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { NewCardContent } from '../ui/new-card';
import { Button } from '../ui/button';
import { PlusIcon, ExternalLink, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { CreateAttemptDialog } from '@/components/dialogs/tasks/CreateAttemptDialog';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { DataTable, type ColumnDef } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface TaskPanelProps {
  task: TaskWithAttemptStatus | null;
}

const TaskPanel = ({ task }: TaskPanelProps) => {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();
  const { config } = useUserSystem();
  const [propertiesExpanded, setPropertiesExpanded] = useState(true);

  const {
    data: attempts = [],
    isLoading: isAttemptsLoading,
    isError: isAttemptsError,
  } = useTaskAttemptsWithSessions(task?.id);

  // Fetch task properties (GitHub fields)
  const { data: taskProps } = useSingleTaskProperties(task?.id);

  const { data: parentAttempt, isLoading: isParentLoading } =
    useTaskAttemptWithSession(task?.parent_workspace_id || undefined);

  const formatTimeAgo = (iso: string) => {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const absSec = Math.round(Math.abs(diffMs) / 1000);

    const rtf =
      typeof Intl !== 'undefined' &&
      typeof Intl.RelativeTimeFormat === 'function'
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

  if (!task) {
    return (
      <div className="text-muted-foreground">
        {t('taskPanel.noTaskSelected')}
      </div>
    );
  }

  const titleContent = `# ${task.title || 'Task'}`;
  const descriptionContent = task.description || '';

  // Get GitHub issue URL from task properties
  const githubIssueUrl = taskProps?.githubIssueUrl;

  // Build properties list for Notion-style display
  const propertyItems: Array<{ key: string; label: string; value: React.ReactNode }> = [];

  if (taskProps?.githubStatus) {
    propertyItems.push({
      key: 'status',
      label: 'ステータス',
      value: (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          {taskProps.githubStatus}
        </span>
      ),
    });
  }

  if (taskProps?.githubPriority) {
    const priority = taskProps.githubPriority;
    const priorityClass = cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      (priority === 'P0' || priority.toLowerCase() === 'critical') &&
        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      (priority === 'P1' || priority.toLowerCase() === 'high') &&
        'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      (priority === 'P2' || priority.toLowerCase() === 'medium') &&
        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      (priority === 'P3' || priority.toLowerCase() === 'low') &&
        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    );
    propertyItems.push({
      key: 'priority',
      label: '優先度',
      value: <span className={priorityClass}>{priority}</span>,
    });
  }

  if (taskProps?.githubAssignees && taskProps.githubAssignees.length > 0) {
    propertyItems.push({
      key: 'assignees',
      label: '担当者',
      value: (
        <div className="flex items-center gap-1.5 flex-wrap">
          {taskProps.githubAssignees.map((assignee) => (
            <span
              key={assignee}
              className="inline-flex items-center justify-center h-6 px-2 rounded-full bg-secondary text-xs font-medium"
            >
              {assignee}
            </span>
          ))}
        </div>
      ),
    });
  }

  // Add ジャンル (genre) if present
  if (taskProps?.['ジャンル']) {
    propertyItems.push({
      key: 'genre',
      label: 'ジャンル',
      value: (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary">
          {taskProps['ジャンル'] as string}
        </span>
      ),
    });
  }

  // Add labels if present
  if (taskProps?.githubLabels && taskProps.githubLabels.length > 0) {
    propertyItems.push({
      key: 'labels',
      label: 'ラベル',
      value: (
        <div className="flex items-center gap-1.5 flex-wrap">
          {taskProps.githubLabels.map((label) => (
            <span
              key={label.name}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: `#${label.color}20`,
                color: `#${label.color}`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      ),
    });
  }

  const attemptColumns: ColumnDef<WorkspaceWithSession>[] = [
    {
      id: 'executor',
      header: '',
      accessor: (attempt) => attempt.session?.executor || 'Base Agent',
      className: 'pr-4',
    },
    {
      id: 'branch',
      header: '',
      accessor: (attempt) => attempt.branch || '—',
      className: 'pr-4',
    },
    {
      id: 'time',
      header: '',
      accessor: (attempt) => formatTimeAgo(attempt.created_at),
      className: 'pr-0 text-right',
    },
  ];

  return (
    <>
      <NewCardContent>
        <div className="p-6 flex flex-col h-full max-h-[calc(100vh-8rem)]">
          <div className="space-y-4 overflow-y-auto flex-shrink min-h-0">
            {/* Title */}
            <WYSIWYGEditor value={titleContent} disabled />

            {/* GitHub Link */}
            {githubIssueUrl && (
              <a
                href={githubIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink size={14} />
                <span>GitHub Issue</span>
              </a>
            )}

            {/* Notion-style Properties Section */}
            {propertyItems.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPropertiesExpanded(!propertiesExpanded)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  {propertiesExpanded ? (
                    <ChevronDown size={16} className="text-muted-foreground" />
                  ) : (
                    <ChevronRight size={16} className="text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-foreground/70">
                    プロパティ
                  </span>
                </button>
                {propertiesExpanded && (
                  <div className="divide-y">
                    {propertyItems.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center px-3 py-2.5 hover:bg-muted/20 transition-colors"
                      >
                        <span className="w-24 text-sm text-muted-foreground shrink-0">
                          {item.label}
                        </span>
                        <div className="flex-1">{item.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Description / Issue Body */}
            {descriptionContent && (
              <div className="pt-2">
                <WYSIWYGEditor value={descriptionContent} disabled />
              </div>
            )}
          </div>

          <div className="mt-6 flex-shrink-0 space-y-4">
            {task.parent_workspace_id && (
              <DataTable
                data={parentAttempt ? [parentAttempt] : []}
                columns={attemptColumns}
                keyExtractor={(attempt) => attempt.id}
                onRowClick={(attempt) => {
                  if (config?.beta_workspaces) {
                    navigate(`/workspaces/${attempt.id}`);
                  } else if (projectId) {
                    navigate(
                      paths.attempt(projectId, attempt.task_id, attempt.id)
                    );
                  }
                }}
                isLoading={isParentLoading}
                headerContent="Parent Attempt"
              />
            )}

            {isAttemptsLoading ? (
              <div className="text-muted-foreground">
                {t('taskPanel.loadingAttempts')}
              </div>
            ) : isAttemptsError ? (
              <div className="text-destructive">
                {t('taskPanel.errorLoadingAttempts')}
              </div>
            ) : displayedAttempts.length === 0 ? (
              /* No attempts - show prominent CTA */
              <div className="border rounded-lg p-6 text-center space-y-4">
                <div className="text-muted-foreground text-sm">
                  {t('taskPanel.noAttempts')}
                </div>
                <Button
                  size="lg"
                  className="gap-2"
                  onClick={() =>
                    CreateAttemptDialog.show({
                      taskId: task.id,
                    })
                  }
                >
                  <Play size={18} />
                  エージェントを実行
                </Button>
              </div>
            ) : (
              <DataTable
                data={displayedAttempts}
                columns={attemptColumns}
                keyExtractor={(attempt) => attempt.id}
                onRowClick={(attempt) => {
                  if (config?.beta_workspaces) {
                    navigate(`/workspaces/${attempt.id}`);
                  } else if (projectId && task.id) {
                    navigate(paths.attempt(projectId, task.id, attempt.id));
                  }
                }}
                headerContent={
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
                          CreateAttemptDialog.show({
                            taskId: task.id,
                          })
                        }
                      >
                        <PlusIcon size={16} />
                      </Button>
                    </span>
                  </div>
                }
              />
            )}
          </div>
        </div>
      </NewCardContent>
    </>
  );
};

export default TaskPanel;
