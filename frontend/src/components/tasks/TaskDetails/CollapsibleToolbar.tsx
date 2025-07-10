import { Dispatch, SetStateAction, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TaskDetailsToolbar } from '@/components/tasks/TaskDetailsToolbar.tsx';
import { makeRequest } from '@/lib/api.ts';
import type {
  ApiResponse,
  EditorType,
  ExecutionProcess,
  ExecutionProcessSummary,
  GitBranch,
  TaskAttempt,
  TaskWithAttemptStatus,
} from 'shared/types.ts';

type Props = {
  taskAttempts: TaskAttempt[];
  selectedAttempt: TaskAttempt | null;
  selectedExecutor: string;
  devServerDetails: ExecutionProcess | null;
  branches: GitBranch[];
  selectedBranch: string | null;
  runningDevServer?: ExecutionProcessSummary;
  isAttemptRunning: boolean;
  processedDevServerLogs: string;
  setIsHoveringDevServer: Dispatch<SetStateAction<boolean>>;
  handleAttemptChange: (attemptId: string) => void;
  handleOpenInEditor: (editorType?: EditorType) => void;
  task: TaskWithAttemptStatus;
  projectHasDevScript?: boolean;
  projectId: string;
  fetchAttemptData: (attemptId: string) => Promise<void> | void;
  fetchTaskAttempts: () => Promise<void> | void;
  isStopping: boolean;
  stopAllExecutions: () => Promise<void> | void;
};

function CollapsibleToolbar({
  taskAttempts,
  selectedAttempt,
  selectedExecutor,
  devServerDetails,
  branches,
  selectedBranch,
  runningDevServer,
  isAttemptRunning,
  processedDevServerLogs,
  setIsHoveringDevServer,
  handleAttemptChange,
  handleOpenInEditor,
  task,
  projectHasDevScript,
  projectId,
  fetchAttemptData,
  fetchTaskAttempts,
  isStopping,
  stopAllExecutions,
}: Props) {
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [isStartingDevServer, setIsStartingDevServer] = useState(false);

  const startDevServer = async () => {
    if (!task || !selectedAttempt) return;

    setIsStartingDevServer(true);

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/start-dev-server`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to start dev server');
      }

      const data: ApiResponse<null> = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to start dev server');
      }

      fetchAttemptData(selectedAttempt.id);
    } catch (err) {
      console.error('Failed to start dev server:', err);
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const stopDevServer = async () => {
    if (!task || !selectedAttempt || !runningDevServer) return;

    setIsStartingDevServer(true);

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/execution-processes/${runningDevServer.id}/stop`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to stop dev server');
      }

      fetchAttemptData(selectedAttempt.id);
    } catch (err) {
      console.error('Failed to stop dev server:', err);
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const createNewAttempt = async (executor?: string, baseBranch?: string) => {
    if (!task) return;

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${task.id}/attempts`,
        {
          method: 'POST',
          body: JSON.stringify({
            executor: executor || selectedExecutor,
            base_branch: baseBranch || selectedBranch,
          }),
        }
      );

      if (response.ok) {
        fetchTaskAttempts();
      }
    } catch (err) {
      console.error('Failed to create new attempt:', err);
    }
  };

  return (
    <div className="border-b">
      <div className="px-4 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Task Details
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsHeaderCollapsed((prev) => !prev)}
          className="h-6 w-6 p-0"
        >
          {isHeaderCollapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>
      </div>
      {!isHeaderCollapsed && (
        <TaskDetailsToolbar
          task={task}
          projectHasDevScript={projectHasDevScript}
          projectId={projectId}
          selectedAttempt={selectedAttempt}
          taskAttempts={taskAttempts}
          isAttemptRunning={isAttemptRunning}
          isStopping={isStopping}
          selectedExecutor={selectedExecutor}
          runningDevServer={runningDevServer}
          isStartingDevServer={isStartingDevServer}
          devServerDetails={devServerDetails}
          processedDevServerLogs={processedDevServerLogs}
          branches={branches}
          selectedBranch={selectedBranch}
          onAttemptChange={handleAttemptChange}
          onCreateNewAttempt={createNewAttempt}
          onStopAllExecutions={stopAllExecutions}
          onStartDevServer={startDevServer}
          onStopDevServer={stopDevServer}
          onOpenInEditor={handleOpenInEditor}
          onSetIsHoveringDevServer={setIsHoveringDevServer}
        />
      )}
    </div>
  );
}

export default CollapsibleToolbar;
