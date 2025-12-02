import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, Loader2, Bot, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DashboardTask } from 'shared/types';

const BANNER_OPEN_KEY = 'status-summary-banner-open';

function TaskItem({ task }: { task: DashboardTask }) {
  const link = `/projects/${task.project_id}/tasks/${task.task_id}/attempts/latest`;

  return (
    <Link
      to={link}
      className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{task.task_title}</div>
        <div className="text-xs text-muted-foreground truncate">
          {task.project_name}
        </div>
      </div>
      {task.executor && (
        <Badge variant="secondary" className="text-xs shrink-0">
          <Bot className="h-3 w-3 mr-1" />
          {task.executor}
        </Badge>
      )}
    </Link>
  );
}

function TaskSection({
  title,
  tasks,
  icon,
  badgeClass,
}: {
  title: string;
  tasks: DashboardTask[];
  icon: React.ReactNode;
  badgeClass: string;
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-2">
        {icon}
        <span>{title}</span>
        <Badge className={badgeClass}>{tasks.length}</Badge>
      </div>
      <div className="space-y-0.5">
        {tasks.map((task) => (
          <TaskItem key={task.task_id} task={task} />
        ))}
      </div>
    </div>
  );
}

export function StatusSummaryBanner() {
  const { t } = useTranslation('projects');
  const { data, isLoading, error } = useDashboardSummary();
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(BANNER_OPEN_KEY);
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem(BANNER_OPEN_KEY, String(isOpen));
  }, [isOpen]);

  const runningCount = data?.running_tasks.length ?? 0;
  const inReviewCount = data?.in_review_tasks.length ?? 0;
  const totalCount = runningCount + inReviewCount;

  // Don't render if there's nothing to show and not loading
  if (!isLoading && totalCount === 0) {
    return null;
  }

  return (
    <details
      className="group mb-4"
      open={isOpen}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
    >
      <summary className="list-none cursor-pointer">
        <Card className="bg-muted p-3 text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-medium">
              {t('statusBanner.title', 'Active Tasks')}
            </span>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex items-center gap-2">
                {runningCount > 0 && (
                  <Badge className="bg-blue-500 hover:bg-blue-600 text-white">
                    {runningCount} {t('statusBanner.running', 'Running')}
                  </Badge>
                )}
                {inReviewCount > 0 && (
                  <Badge className="bg-amber-500 hover:bg-amber-600 text-white">
                    {inReviewCount} {t('statusBanner.inReview', 'In Review')}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <ChevronUp
            aria-hidden
            className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </Card>
      </summary>

      <Card className="mt-2 p-3 space-y-4">
        {error && (
          <div className="text-sm text-destructive">
            Failed to load dashboard summary
          </div>
        )}

        {data && (
          <>
            <TaskSection
              title={t('statusBanner.running', 'Running')}
              tasks={data.running_tasks}
              icon={<Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              badgeClass="bg-blue-500 hover:bg-blue-600 text-white"
            />
            <TaskSection
              title={t('statusBanner.inReview', 'In Review')}
              tasks={data.in_review_tasks}
              icon={<Clock className="h-4 w-4 text-amber-500" />}
              badgeClass="bg-amber-500 hover:bg-amber-600 text-white"
            />
          </>
        )}
      </Card>
    </details>
  );
}
