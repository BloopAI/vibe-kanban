import TaskAttemptPanel from './TaskAttemptPanel';
import TaskPanel from './TaskPanel';
import { NewCard, NewCardHeader } from '../ui/new-card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui/breadcrumb';
import type { TaskWithAttemptStatus } from 'shared/types';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { AttemptHeaderActions } from './AttemptHeaderActions';

interface KanbanSidebarProps {
  selectedTask: TaskWithAttemptStatus | null;
}

const KanbanSidebar = ({ selectedTask }: KanbanSidebarProps) => {
  const navigate = useNavigate();
  const { projectId, attemptId } = useParams<{
    projectId: string;
    attemptId?: string;
  }>();

  const effectiveAttemptId = attemptId === 'latest' ? undefined : attemptId;
  const { data: attempt } = useTaskAttempt(effectiveAttemptId);

  const showAttempt = Boolean(attemptId && attemptId !== 'latest');

  const truncateTitle = (title: string | undefined, maxLength = 20) => {
    if (!title) return 'Task';
    if (title.length <= maxLength) return title;

    const truncated = title.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    return lastSpace > 0
      ? `${truncated.substring(0, lastSpace)}...`
      : `${truncated}...`;
  };

  return (
    <NewCard className="h-full min-h-0 flex flex-col max-w-[800px] border-x shadow-lg bg-diagonal-lines bg-background">
      <NewCardHeader
        className="shrink-0"
        actions={
          <AttemptHeaderActions
            onClose={() =>
              navigate(`/projects/${projectId}/tasks`, { replace: true })
            }
          />
        }
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {showAttempt && selectedTask ? (
                <BreadcrumbLink asChild>
                  <Link to="..">{truncateTitle(selectedTask.title)}</Link>
                </BreadcrumbLink>
              ) : (
                truncateTitle(selectedTask?.title)
              )}
            </BreadcrumbItem>
            {showAttempt && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {attempt?.branch || 'Task Attempt'}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </NewCardHeader>
      {showAttempt ? (
        <TaskAttemptPanel attempt={attempt} task={selectedTask}>
          {({ logs, followUp }) => (
            <>
              <div className="flex-1 min-h-0 flex flex-col">{logs}</div>
              <div className="shrink-0">{followUp}</div>
            </>
          )}
        </TaskAttemptPanel>
      ) : (
        <TaskPanel task={selectedTask} />
      )}
    </NewCard>
  );
};

export default KanbanSidebar;
