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
import { useParams } from 'react-router-dom';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useTaskViewManager } from '@/hooks/useTaskViewManager';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '../ui/button';

interface KanbanSidebarProps {
  selectedTask: TaskWithAttemptStatus | null;
}

type TaskViewManager = ReturnType<typeof useTaskViewManager>;

interface HeaderActionsProps
  extends Pick<
    TaskViewManager,
    'isFullscreen' | 'toggleFullscreen' | 'navigateToTasksList'
  > {
  projectId: string;
}

const HeaderActions = ({
  projectId,
  isFullscreen,
  toggleFullscreen,
  navigateToTasksList,
}: HeaderActionsProps) => {
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
  const {
    isFullscreen,
    toggleFullscreen,
    navigateToTasksList,
    navigateToTask,
  } = useTaskViewManager();
  const { projectId, attemptId } = useParams<{
    projectId: string;
    attemptId?: string;
  }>();

  // Don't fetch attempt when attemptId is 'latest' (will be resolved in parent)
  const effectiveAttemptId = attemptId === 'latest' ? undefined : attemptId;
  const { data: attempt } = useTaskAttempt(effectiveAttemptId);

  const showAttempt = Boolean(attemptId && attemptId !== 'latest');
  const handleBreadcrumbClick = () => {
    if (!projectId || !selectedTask) return;
    navigateToTask(projectId, selectedTask.id, {
      fullscreen: isFullscreen,
      replace: false,
    });
  };

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
      <NewCardHeader
        actions={
          <HeaderActions
            projectId={projectId!}
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
            navigateToTasksList={navigateToTasksList}
          />
        }
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {showAttempt && selectedTask ? (
                <BreadcrumbLink asChild>
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors"
                    onClick={handleBreadcrumbClick}
                  >
                    {truncateTitle(selectedTask.title)}
                  </button>
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
