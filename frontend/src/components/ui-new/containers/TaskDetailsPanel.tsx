import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WarningIcon, XIcon } from '@phosphor-icons/react';
import { Loader } from '@/components/ui/loader';
import type { RepoBranchStatus, Workspace } from 'shared/types';

import {
  ProjectProviderOverride,
  useProjectOverride,
} from '@/contexts/ProjectProviderOverride';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useBranchStatus, useAttemptExecution } from '@/hooks';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import {
  GitOperationsProvider,
  useGitOperationsError,
} from '@/contexts/GitOperationsContext';

import { useProjectTasks } from '@/hooks/useProjectTasks';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { LayoutMode } from '@/components/layout/TasksLayout';
import { PreviewPanel } from '@/components/panels/PreviewPanel';
import { DiffsPanel } from '@/components/panels/DiffsPanel';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import TaskPanel from '@/components/panels/TaskPanel';
import TodoPanel from '@/components/tasks/TodoPanel';
import { NewCard, NewCardHeader } from '@/components/ui/new-card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AttemptHeaderActions } from '@/components/panels/AttemptHeaderActions';
import { TaskPanelHeaderActions } from '@/components/panels/TaskPanelHeaderActions';

import type { TaskWithAttemptStatus } from 'shared/types';

function GitErrorBanner() {
  const { error: gitError } = useGitOperationsError();

  if (!gitError) return null;

  return (
    <div className="mx-4 mt-4 p-3 border border-destructive rounded">
      <div className="text-destructive text-sm">{gitError}</div>
    </div>
  );
}

function DiffsPanelContainer({
  attempt,
  selectedTask,
  branchStatus,
  branchStatusError,
}: {
  attempt: Workspace | null;
  selectedTask: TaskWithAttemptStatus | null;
  branchStatus: RepoBranchStatus[] | null;
  branchStatusError?: Error | null;
}) {
  const { isAttemptRunning } = useAttemptExecution(attempt?.id);

  return (
    <DiffsPanel
      key={attempt?.id}
      selectedAttempt={attempt}
      gitOps={
        attempt && selectedTask
          ? {
              task: selectedTask,
              branchStatus: branchStatus ?? null,
              branchStatusError,
              isAttemptRunning,
              selectedBranch: branchStatus?.[0]?.target_branch_name ?? null,
            }
          : undefined
      }
    />
  );
}

interface TaskDetailsPanelProps {
  projectId: string;
  taskId: string;
  onClose: () => void;
}

function TaskDetailsPanelContent({
  taskId: initialTaskId,
  onClose,
}: Omit<TaskDetailsPanelProps, 'projectId'>) {
  const { t } = useTranslation(['tasks', 'common']);

  const {
    projectId,
    isLoading: projectLoading,
    error: projectError,
  } = useProjectOverride();

  // Internal state for task/attempt selection
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(
    null
  );
  const [mode, setMode] = useState<LayoutMode>(null);

  // Reset state when task changes - ensures panel shows the new task
  useEffect(() => {
    setSelectedAttemptId(null);
    setMode(null);
  }, [initialTaskId]);

  // Handler for when a new attempt is created - stay on page and show attempt
  const handleAttemptCreated = useCallback((attemptId: string) => {
    setSelectedAttemptId(attemptId);
  }, []);

  const {
    tasksById,
    sharedTasksById,
    isLoading,
    error: streamError,
  } = useProjectTasks(projectId || '');

  const selectedTask = useMemo(
    () => (initialTaskId ? (tasksById[initialTaskId] ?? null) : null),
    [initialTaskId, tasksById]
  );

  // Auto-select latest attempt when task is selected
  const { data: attempts = [], isLoading: isAttemptsLoading } = useTaskAttempts(
    initialTaskId,
    {
      enabled: !!initialTaskId && !selectedAttemptId,
    }
  );

  const latestAttemptId = useMemo(() => {
    if (!attempts?.length) return undefined;
    return [...attempts].sort((a, b) => {
      const diff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    })[0].id;
  }, [attempts]);

  // Auto-select latest attempt if none selected
  useEffect(() => {
    if (!initialTaskId || selectedAttemptId) return;
    if (isAttemptsLoading) return;
    if (latestAttemptId) {
      setSelectedAttemptId(latestAttemptId);
    }
  }, [initialTaskId, selectedAttemptId, isAttemptsLoading, latestAttemptId]);

  const isTaskView = !!initialTaskId && !selectedAttemptId;
  const { data: attempt } = useTaskAttemptWithSession(
    selectedAttemptId ?? undefined
  );

  const { data: branchStatus, error: branchStatusError } = useBranchStatus(
    attempt?.id
  );

  const getSharedTask = useCallback(
    (task: TaskWithAttemptStatus | null | undefined) => {
      if (!task) return undefined;
      if (task.shared_task_id) {
        return sharedTasksById[task.shared_task_id];
      }
      return sharedTasksById[task.id];
    },
    [sharedTasksById]
  );

  const isInitialTasksLoad = isLoading && Object.keys(tasksById).length === 0;

  if (projectError) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <WarningIcon className="size-icon-sm" />
            {t('common:states.error')}
          </AlertTitle>
          <AlertDescription>
            {projectError.message || 'Failed to load project'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (projectLoading && isInitialTasksLoad) {
    return <Loader message={t('loading')} className="py-8" />;
  }

  if (!selectedTask) {
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-base py-half bg-secondary border-b border-panel">
          <span className="text-sm text-normal font-medium">Task Details</span>
          <button
            type="button"
            onClick={onClose}
            className="p-half rounded hover:bg-panel text-low hover:text-normal transition-colors"
            title="Close panel"
          >
            <XIcon className="size-icon-sm" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-low">
          Task not found
        </div>
      </div>
    );
  }

  const truncateTitle = (title: string | undefined, maxLength = 30) => {
    if (!title) return 'Task';
    if (title.length <= maxLength) return title;

    const truncated = title.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    return lastSpace > 0
      ? `${truncated.substring(0, lastSpace)}...`
      : `${truncated}...`;
  };

  const rightHeader = (
    <NewCardHeader
      className="shrink-0"
      actions={
        isTaskView ? (
          <TaskPanelHeaderActions
            task={selectedTask}
            sharedTask={getSharedTask(selectedTask)}
            onClose={onClose}
            projectId={projectId}
            onAttemptCreated={handleAttemptCreated}
          />
        ) : (
          <AttemptHeaderActions
            mode={mode}
            onModeChange={setMode}
            task={selectedTask}
            sharedTask={getSharedTask(selectedTask)}
            attempt={attempt ?? null}
            onClose={onClose}
          />
        )
      }
    >
      <div className="mx-auto w-full">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {isTaskView ? (
                <BreadcrumbPage>
                  {truncateTitle(selectedTask?.title)}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  className="cursor-pointer hover:underline"
                  onClick={() => {
                    setSelectedAttemptId(null);
                    setMode(null);
                  }}
                >
                  {truncateTitle(selectedTask?.title)}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!isTaskView && (
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
      </div>
    </NewCardHeader>
  );

  const attemptContent = (
    <NewCard className="h-full min-h-0 flex flex-col bg-muted border-0">
      {isTaskView ? (
        <TaskPanel
          task={selectedTask}
          projectId={projectId}
          onAttemptCreated={handleAttemptCreated}
        />
      ) : (
        <TaskAttemptPanel attempt={attempt} task={selectedTask}>
          {({ logs, followUp }) => (
            <>
              <GitErrorBanner />
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 flex flex-col">{logs}</div>

                <div className="shrink-0 border-t">
                  <div className="mx-auto w-full max-w-[50rem]">
                    <TodoPanel />
                  </div>
                </div>

                <div className="min-h-0 max-h-[50%] border-t overflow-hidden bg-background">
                  <div className="mx-auto w-full max-w-[50rem] h-full min-h-0">
                    {followUp}
                  </div>
                </div>
              </div>
            </>
          )}
        </TaskAttemptPanel>
      )}
    </NewCard>
  );

  const auxContent =
    selectedTask && attempt ? (
      <div className="relative h-full w-full">
        {mode === 'preview' && <PreviewPanel />}
        {mode === 'diffs' && (
          <DiffsPanelContainer
            attempt={attempt}
            selectedTask={selectedTask}
            branchStatus={branchStatus ?? null}
            branchStatusError={branchStatusError}
          />
        )}
      </div>
    ) : (
      <div className="relative h-full w-full" />
    );

  // Simplified layout - no kanban, just task details
  const content = (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 sticky top-0 z-20 bg-background border-b">
        {rightHeader}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {mode === null ? (
          attemptContent
        ) : (
          <div className="h-full flex">
            <div className="w-1/3 min-w-[300px] border-r overflow-hidden">
              {attemptContent}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">{auxContent}</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <GitOperationsProvider attemptId={attempt?.id}>
      <ClickedElementsProvider attempt={attempt}>
        <ReviewProvider attemptId={attempt?.id}>
          <ExecutionProcessesProvider
            attemptId={attempt?.id}
            sessionId={attempt?.session?.id}
          >
            <div className="h-full flex flex-col">
              {streamError && (
                <Alert className="w-full z-30 xl:sticky xl:top-0">
                  <AlertTitle className="flex items-center gap-2">
                    <WarningIcon className="size-icon-sm" />
                    {t('common:states.reconnecting')}
                  </AlertTitle>
                  <AlertDescription>{streamError}</AlertDescription>
                </Alert>
              )}

              <div className="flex-1 min-h-0">{content}</div>
            </div>
          </ExecutionProcessesProvider>
        </ReviewProvider>
      </ClickedElementsProvider>
    </GitOperationsProvider>
  );
}

/**
 * TaskDetailsPanel - Shows task details without a kanban board.
 * Used as the right panel in the swimlane kanban view.
 */
export function TaskDetailsPanel({
  projectId,
  taskId,
  onClose,
}: TaskDetailsPanelProps) {
  return (
    <ProjectProviderOverride projectId={projectId}>
      <TaskDetailsPanelContent taskId={taskId} onClose={onClose} />
    </ProjectProviderOverride>
  );
}
