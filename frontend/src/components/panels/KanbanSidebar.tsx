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
import ResponsiveSidebar from './ResponsiveSidebar';
import type { TaskWithAttemptStatus } from 'shared/types';
import { useParams, Link } from 'react-router-dom';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';

interface KanbanSidebarProps {
  selectedTask: TaskWithAttemptStatus | null;
}

const KanbanSidebar = ({ selectedTask }: KanbanSidebarProps) => {
  const { projectId, attemptId } = useParams<{
    projectId: string;
    attemptId?: string;
  }>();

  const { data: attempt } = useTaskAttempt(attemptId);

  const showAttempt = Boolean(attemptId);
  const taskUrl = `/projects/${projectId}/tasks/${selectedTask?.id}`;

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
    <ResponsiveSidebar>
      <NewCard className="bg-background h-full">
        <NewCardHeader>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {showAttempt ? (
                  <BreadcrumbLink asChild>
                    <Link to={taskUrl}>
                      {truncateTitle(selectedTask?.title)}
                    </Link>
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
          <TaskAttemptPanel attemptId={attemptId!} />
        ) : (
          <TaskPanel task={selectedTask} />
        )}
      </NewCard>
    </ResponsiveSidebar>
  );
};

export default KanbanSidebar;
