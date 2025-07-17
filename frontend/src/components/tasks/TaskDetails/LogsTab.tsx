import { useContext } from 'react';
import { MessageSquare } from 'lucide-react';
import { NormalizedConversationViewer } from '@/components/tasks/TaskDetails/LogsTab/NormalizedConversationViewer.tsx';
import {
  TaskAttemptDataContext,
  TaskAttemptLoadingContext,
  TaskExecutionStateContext,
  TaskSelectedAttemptContext,
} from '@/components/context/taskDetailsContext.ts';
import Conversation from '@/components/tasks/TaskDetails/LogsTab/Conversation.tsx';
import { Loader } from '@/components/ui/loader';
import SetupScriptRunning from '@/components/tasks/TaskDetails/LogsTab/SetupScriptRunning.tsx';

function LogsTab() {
  const { loading } = useContext(TaskAttemptLoadingContext);
  const { executionState } = useContext(TaskExecutionStateContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const { attemptData } = useContext(TaskAttemptDataContext);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader message="Loading..." size={32} />
      </div>
    );
  }

  // If no attempt is selected, show message
  if (!selectedAttempt) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium mb-2">No attempt selected</p>
        <p className="text-sm">Select an attempt to view its logs</p>
      </div>
    );
  }

  // If no execution state, execution hasn't started yet
  if (!executionState) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium mb-2">
          Task execution not started yet
        </p>
        <p className="text-sm">
          Logs will appear here once the task execution begins
        </p>
      </div>
    );
  }

  const isSetupRunning = executionState.execution_state === 'SetupRunning';
  const isSetupComplete = executionState.execution_state === 'SetupComplete';
  const isSetupFailed = executionState.execution_state === 'SetupFailed';
  const isSetupStopped = executionState.execution_state === 'SetupStopped';
  const isCodingAgentRunning =
    executionState.execution_state === 'CodingAgentRunning';
  const isCodingAgentComplete =
    executionState.execution_state === 'CodingAgentComplete';
  const isCodingAgentFailed =
    executionState.execution_state === 'CodingAgentFailed';
  const isCodingAgentStopped =
    executionState.execution_state === 'CodingAgentStopped';
  const isComplete = executionState.execution_state === 'Complete';
  const hasChanges = executionState.has_changes;

  // When setup script is running, show setup execution stdio
  if (isSetupRunning) {
    return (
      <SetupScriptRunning
        setupProcessId={executionState.setup_process_id}
        runningProcessDetails={attemptData.runningProcessDetails}
      />
    );
  }

  // When setup failed or was stopped
  if (isSetupFailed || isSetupStopped) {
    let setupProcess = executionState.setup_process_id
      ? attemptData.runningProcessDetails[executionState.setup_process_id]
      : Object.values(attemptData.runningProcessDetails).find(
          (process) => process.process_type === 'setupscript'
        );

    // If not found in runningProcessDetails, try to find in processes array
    if (!setupProcess) {
      const setupSummary = attemptData.processes.find(
        (process) => process.process_type === 'setupscript'
      );

      if (setupSummary) {
        setupProcess = Object.values(attemptData.runningProcessDetails).find(
          (process) => process.id === setupSummary.id
        );

        if (!setupProcess) {
          setupProcess = {
            ...setupSummary,
            stdout: null,
            stderr: null,
          } as any;
        }
      }
    }

    return (
      <div className="h-full overflow-y-auto">
        <div className="mb-4">
          <p
            className={`text-lg font-semibold mb-2 ${isSetupFailed ? 'text-destructive' : ''}`}
          >
            {isSetupFailed ? 'Setup Script Failed' : 'Setup Script Stopped'}
          </p>
          {isSetupFailed && (
            <p className="text-muted-foreground mb-4">
              The setup script encountered an error. Error details below:
            </p>
          )}
        </div>

        {setupProcess && (
          <NormalizedConversationViewer executionProcess={setupProcess} />
        )}
      </div>
    );
  }

  // When coding agent is in any state (running, complete, failed, stopped)
  if (
    isCodingAgentRunning ||
    isCodingAgentComplete ||
    isCodingAgentFailed ||
    isCodingAgentStopped ||
    hasChanges
  ) {
    return <Conversation />;
  }

  // When setup is complete but coding agent hasn't started, show waiting state
  if (
    isSetupComplete &&
    !isCodingAgentRunning &&
    !isCodingAgentComplete &&
    !isCodingAgentFailed &&
    !isCodingAgentStopped &&
    !hasChanges
  ) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-semibold mb-2">Setup Complete</p>
        <p>Waiting for coding agent to start...</p>
      </div>
    );
  }

  // When task is complete, show completion message
  if (isComplete) {
    return (
      <div className="text-center py-8 text-green-600">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-semibold mb-2">Task Complete</p>
        <p className="text-muted-foreground">
          The task has been completed successfully.
        </p>
      </div>
    );
  }

  // When coding agent is running or complete, show conversation
  if (isCodingAgentRunning || isCodingAgentComplete || hasChanges) {
    return <Conversation />;
  }

  // Default case - unexpected state
  return (
    <div className="text-center py-8 text-muted-foreground">
      <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>Unknown execution state</p>
    </div>
  );
}

export default LogsTab;
