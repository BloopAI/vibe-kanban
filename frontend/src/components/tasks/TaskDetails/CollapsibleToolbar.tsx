import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TaskDetailsToolbar } from '@/components/tasks/TaskDetailsToolbar.tsx';

type Props = {
  taskAttempts: any;
  selectedAttempt: any;
  selectedExecutor: any;
  isStopping: any;
  isStartingDevServer: any;
  devServerDetails: any;
  branches: any;
  selectedBranch: any;
  runningDevServer: any;
  isAttemptRunning: any;
  processedDevServerLogs: any;
  setIsHoveringDevServer: any;
  handleAttemptChange: any;
  createNewAttempt: any;
  stopAllExecutions: any;
  startDevServer: any;
  stopDevServer: any;
  handleOpenInEditor: any;
  task: any;
  projectHasDevScript: any;
  projectId: any;
};

function CollapsibleToolbar({
  taskAttempts,
  selectedAttempt,
  selectedExecutor,
  isStopping,
  isStartingDevServer,
  devServerDetails,
  branches,
  selectedBranch,
  runningDevServer,
  isAttemptRunning,
  processedDevServerLogs,
  setIsHoveringDevServer,
  handleAttemptChange,
  createNewAttempt,
  stopAllExecutions,
  startDevServer,
  stopDevServer,
  handleOpenInEditor,
  task,
  projectHasDevScript,
  projectId,
}: Props) {
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
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
