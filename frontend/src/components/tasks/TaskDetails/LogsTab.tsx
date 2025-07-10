import { RefObject } from 'react';
import { MessageSquare } from 'lucide-react';
import { NormalizedConversationViewer } from '@/components/tasks/TaskDetails/NormalizedConversationViewer.tsx';
import type {
  ExecutionProcess,
  ExecutionProcessSummary,
  TaskAttempt,
  TaskAttemptActivityWithPrompt,
  TaskAttemptState,
  WorktreeDiff,
} from 'shared/types.ts';

type Props = {
  loading: boolean;
  selectedAttempt: TaskAttempt | null;
  attemptData: {
    activities: TaskAttemptActivityWithPrompt[];
    processes: ExecutionProcessSummary[];
    runningProcessDetails: Record<string, ExecutionProcess>;
  };
  executionState: TaskAttemptState | null;
  diff: WorktreeDiff | null;
  isBackgroundRefreshing: boolean;
  deletingFiles: Set<string>;
  handleConversationUpdate: () => void;
  handleDeleteFileClick: (file: string) => void;
  projectId: string;
  scrollContainerRef: RefObject<HTMLDivElement>;
  setupScrollRef: RefObject<HTMLDivElement>;
  handleLogsScroll: () => void;
};

function LogsTab({
  loading,
  selectedAttempt,
  attemptData,
  executionState,
  diff,
  isBackgroundRefreshing,
  deletingFiles,
  handleConversationUpdate,
  handleDeleteFileClick,
  projectId,
  scrollContainerRef,
  setupScrollRef,
  handleLogsScroll,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
        <p className="text-muted-foreground ml-4">Loading...</p>
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
  const isCodingAgentRunning =
    executionState.execution_state === 'CodingAgentRunning';
  const isCodingAgentComplete =
    executionState.execution_state === 'CodingAgentComplete';
  const isCodingAgentFailed =
    executionState.execution_state === 'CodingAgentFailed';
  const isComplete = executionState.execution_state === 'Complete';
  const hasChanges = executionState.has_changes;

  // When setup script is running, show setup execution stdio
  if (isSetupRunning) {
    // Find the setup script process in runningProcessDetails first, then fallback to processes
    const setupProcess = executionState.setup_process_id
      ? attemptData.runningProcessDetails[executionState.setup_process_id]
      : Object.values(attemptData.runningProcessDetails).find(
          (process) => process.process_type === 'setupscript'
        );

    return (
      <div ref={setupScrollRef} className="h-full overflow-y-auto">
        <div className="mb-4">
          <p className="text-lg font-semibold mb-2">Setup Script Running</p>
          <p className="text-muted-foreground mb-4">
            Preparing the environment for the coding agent...
          </p>
        </div>

        {setupProcess && (
          <div className="font-mono text-sm whitespace-pre-wrap text-muted-foreground">
            {(() => {
              const stdout = setupProcess.stdout || '';
              const stderr = setupProcess.stderr || '';
              const combined = [stdout, stderr].filter(Boolean).join('\n');
              return combined || 'Waiting for setup script output...';
            })()}
          </div>
        )}
      </div>
    );
  }

  // When setup failed, show error message and conversation
  if (isSetupFailed) {
    const setupProcess = executionState.setup_process_id
      ? attemptData.runningProcessDetails[executionState.setup_process_id]
      : Object.values(attemptData.runningProcessDetails).find(
          (process) => process.process_type === 'setupscript'
        );

    return (
      <div className="h-full overflow-y-auto">
        <div className="mb-4">
          <p className="text-lg font-semibold mb-2 text-destructive">
            Setup Script Failed
          </p>
          <p className="text-muted-foreground mb-4">
            The setup script encountered an error. Error details below:
          </p>
        </div>

        {setupProcess && (
          <NormalizedConversationViewer
            executionProcess={setupProcess}
            projectId={projectId}
            onConversationUpdate={handleConversationUpdate}
          />
        )}
      </div>
    );
  }

  // When coding agent failed, show error message and conversation
  if (isCodingAgentFailed) {
    const codingAgentProcess = executionState.coding_agent_process_id
      ? attemptData.runningProcessDetails[
          executionState.coding_agent_process_id
        ]
      : Object.values(attemptData.runningProcessDetails).find(
          (process) => process.process_type === 'codingagent'
        );

    return (
      <div className="h-full overflow-y-auto">
        <div className="mb-4">
          <p className="text-lg font-semibold mb-2 text-destructive">
            Coding Agent Failed
          </p>
          <p className="text-muted-foreground mb-4">
            The coding agent encountered an error. Error details below:
          </p>
        </div>

        {codingAgentProcess && (
          <NormalizedConversationViewer
            executionProcess={codingAgentProcess}
            projectId={projectId}
            onConversationUpdate={handleConversationUpdate}
          />
        )}
      </div>
    );
  }

  // When setup is complete but coding agent hasn't started, show waiting state
  if (
    isSetupComplete &&
    !isCodingAgentRunning &&
    !isCodingAgentComplete &&
    !isCodingAgentFailed &&
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
    return (
      <div
        ref={scrollContainerRef}
        onScroll={handleLogsScroll}
        className="h-full overflow-y-auto"
      >
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : (
          (() => {
            // Find main coding agent process (command: "executor")
            let mainCodingAgentProcess = Object.values(
              attemptData.runningProcessDetails
            ).find(
              (process) =>
                process.process_type === 'codingagent' &&
                process.command === 'executor'
            );

            if (!mainCodingAgentProcess) {
              const mainCodingAgentSummary = attemptData.processes.find(
                (process) =>
                  process.process_type === 'codingagent' &&
                  process.command === 'executor'
              );

              if (mainCodingAgentSummary) {
                mainCodingAgentProcess = Object.values(
                  attemptData.runningProcessDetails
                ).find((process) => process.id === mainCodingAgentSummary.id);

                if (!mainCodingAgentProcess) {
                  mainCodingAgentProcess = {
                    ...mainCodingAgentSummary,
                    stdout: null,
                    stderr: null,
                  } as any;
                }
              }
            }

            // Find follow up executor processes (command: "followup_executor")
            const followUpProcesses = attemptData.processes
              .filter(
                (process) =>
                  process.process_type === 'codingagent' &&
                  process.command === 'followup_executor'
              )
              .map((summary) => {
                const detailedProcess = Object.values(
                  attemptData.runningProcessDetails
                ).find((process) => process.id === summary.id);
                return (
                  detailedProcess ||
                  ({
                    ...summary,
                    stdout: null,
                    stderr: null,
                  } as any)
                );
              });

            if (mainCodingAgentProcess || followUpProcesses.length > 0) {
              return (
                <div className="space-y-8">
                  {mainCodingAgentProcess && (
                    <div className="space-y-6">
                      <NormalizedConversationViewer
                        executionProcess={mainCodingAgentProcess}
                        projectId={projectId}
                        onConversationUpdate={handleConversationUpdate}
                        diff={diff}
                        isBackgroundRefreshing={isBackgroundRefreshing}
                        onDeleteFile={handleDeleteFileClick}
                        deletingFiles={deletingFiles}
                      />
                    </div>
                  )}
                  {followUpProcesses.map((followUpProcess) => (
                    <div key={followUpProcess.id}>
                      <div className="border-t border-border mb-8"></div>
                      <NormalizedConversationViewer
                        executionProcess={followUpProcess}
                        projectId={projectId}
                        onConversationUpdate={handleConversationUpdate}
                        diff={diff}
                        isBackgroundRefreshing={isBackgroundRefreshing}
                        onDeleteFile={handleDeleteFileClick}
                        deletingFiles={deletingFiles}
                      />
                    </div>
                  ))}
                </div>
              );
            }

            return (
              <div className="text-center py-8 text-muted-foreground">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-lg font-semibold mb-2">
                  Coding Agent Starting
                </p>
                <p>Initializing conversation...</p>
              </div>
            );
          })()
        )}
      </div>
    );
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
