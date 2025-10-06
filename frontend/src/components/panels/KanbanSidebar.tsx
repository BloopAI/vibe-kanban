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
import { useParams, Link } from 'react-router-dom';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useTaskViewManager } from '@/hooks/useTaskViewManager';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '../ui/button';

interface KanbanSidebarProps {
  selectedTask: TaskWithAttemptStatus | null;
}

const HeaderActions = ({ projectId }: { projectId: string }) => {
  const { isFullscreen, toggleFullscreen, navigateToTasksList } =
    useTaskViewManager();

  return (
    <>
      <Button
        variant="icon"
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        aria-pressed={isFullscreen}
        onClick={() => toggleFullscreen(!isFullscreen)}
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </Button>
      <Button
        variant="icon"
        aria-label="Close"
        onClick={() => navigateToTasksList(projectId)}
      >
        <X size={16} />
      </Button>
    </>
  );
};

const KanbanSidebar = ({ selectedTask }: KanbanSidebarProps) => {
  const { projectId, attemptId } = useParams<{
    projectId: string;
    attemptId?: string;
  }>();

  // Don't fetch attempt when attemptId is 'latest' (will be resolved in parent)
  const effectiveAttemptId = attemptId === 'latest' ? undefined : attemptId;
  const { data: attempt } = useTaskAttempt(effectiveAttemptId);

  const showAttempt = Boolean(attemptId && attemptId !== 'latest');
  const taskUrl = selectedTask
    ? `/projects/${projectId}/tasks/${selectedTask.id}`
    : undefined;

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
    <NewCard className="bg-background h-full">
      <NewCardHeader actions={<HeaderActions projectId={projectId!} />}>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {showAttempt && taskUrl ? (
                <BreadcrumbLink asChild>
                  <Link to={taskUrl}>{truncateTitle(selectedTask?.title)}</Link>
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
        <TaskAttemptPanel attempt={attempt} task={selectedTask} />
      ) : (
        <TaskPanel task={selectedTask} />
      )}
    </NewCard>
  );
};

export default KanbanSidebar;
