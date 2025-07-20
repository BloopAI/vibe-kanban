import { useContext, useState } from 'react';
import {
  Play,
  Square,
  AlertCircle,
  CheckCircle,
  Clock,
  Cog,
  ArrowLeft,
} from 'lucide-react';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext.ts';
import { executionProcessesApi } from '@/lib/api.ts';
import type {
  ExecutionProcessStatus,
  ExecutionProcessSummary,
} from 'shared/types.ts';

function ProcessesTab() {
  const { attemptData, setAttemptData } = useContext(TaskAttemptDataContext);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(
    null
  );
  const [loadingProcessId, setLoadingProcessId] = useState<string | null>(null);

  const getStatusIcon = (status: ExecutionProcessStatus) => {
    switch (status) {
      case 'running':
        return <Play className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'killed':
        return <Square className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ExecutionProcessStatus) => {
    switch (status) {
      case 'running':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'completed':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'failed':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'killed':
        return 'bg-gray-50 border-gray-200 text-gray-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const fetchProcessDetails = async (processId: string) => {
    try {
      setLoadingProcessId(processId);
      const result = await executionProcessesApi.getDetails(processId);

      if (result !== undefined) {
        setAttemptData((prev) => ({
          ...prev,
          runningProcessDetails: {
            ...prev.runningProcessDetails,
            [processId]: result,
          },
        }));
      }
    } catch (err) {
      console.error('Failed to fetch process details:', err);
    } finally {
      setLoadingProcessId(null);
    }
  };

  const handleProcessClick = async (process: ExecutionProcessSummary) => {
    setSelectedProcessId(process.id);

    // If we don't have details for this process, fetch them
    if (!attemptData.runningProcessDetails[process.id]) {
      await fetchProcessDetails(process.id);
    }
  };

  const selectedProcess = selectedProcessId
    ? attemptData.runningProcessDetails[selectedProcessId]
    : null;

  if (!attemptData.processes || attemptData.processes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Cog className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No execution processes found for this attempt.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {!selectedProcessId ? (
        <div className="flex-1 overflow-auto px-4 pb-20">
          <div className="space-y-3">
            {attemptData.processes.map((process) => (
              <div
                key={process.id}
                className={`border rounded-lg p-4 hover:bg-muted/30 cursor-pointer transition-colors ${
                  loadingProcessId === process.id
                    ? 'opacity-50 cursor-wait'
                    : ''
                }`}
                onClick={() => handleProcessClick(process)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(process.status)}
                    <div>
                      <h3 className="font-medium text-sm">
                        {process.process_type}
                        {process.executor_type && (
                          <span className="text-muted-foreground">
                            {' '}
                            ({process.executor_type})
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {process.command}
                      </p>
                      {process.args && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Args: {process.args}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-1 text-xs font-medium border rounded-full ${getStatusColor(
                        process.status
                      )}`}
                    >
                      {process.status}
                    </span>
                    {process.exit_code !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Exit: {process.exit_code.toString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Started: {formatDate(process.started_at)}</span>
                    {process.completed_at && (
                      <span>Completed: {formatDate(process.completed_at)}</span>
                    )}
                  </div>
                  <div className="mt-1">
                    Working directory: {process.working_directory}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
            <h2 className="text-lg font-semibold">Process Details</h2>
            <button
              onClick={() => setSelectedProcessId(null)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md border border-border transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to list
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pb-20">
            {selectedProcess ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium text-sm mb-2">Process Info</h3>
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="font-medium">Type:</span>{' '}
                        {selectedProcess.process_type}
                      </p>
                      <p>
                        <span className="font-medium">Status:</span>{' '}
                        {selectedProcess.status}
                      </p>
                      {selectedProcess.executor_type && (
                        <p>
                          <span className="font-medium">Executor:</span>{' '}
                          {selectedProcess.executor_type}
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Exit Code:</span>{' '}
                        {selectedProcess.exit_code?.toString() ?? 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-medium text-sm mb-2">Timing</h3>
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="font-medium">Started:</span>{' '}
                        {formatDate(selectedProcess.started_at)}
                      </p>
                      {selectedProcess.completed_at && (
                        <p>
                          <span className="font-medium">Completed:</span>{' '}
                          {formatDate(selectedProcess.completed_at)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-sm mb-2">Command</h3>
                  <div className="bg-muted/50 p-3 rounded-md font-mono text-sm">
                    {selectedProcess.command}
                    {selectedProcess.args && (
                      <div className="mt-1 text-muted-foreground">
                        Args: {selectedProcess.args}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-sm mb-2">
                    Working Directory
                  </h3>
                  <div className="bg-muted/50 p-3 rounded-md font-mono text-sm">
                    {selectedProcess.working_directory}
                  </div>
                </div>

                {selectedProcess.stdout && (
                  <div>
                    <h3 className="font-medium text-sm mb-2">Stdout</h3>
                    <div className="bg-black text-green-400 p-3 rounded-md font-mono text-sm h-64 overflow-auto">
                      <pre className="whitespace-pre-wrap">
                        {selectedProcess.stdout}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedProcess.stderr && (
                  <div>
                    <h3 className="font-medium text-sm mb-2">Stderr</h3>
                    <div className="bg-black text-red-400 p-3 rounded-md font-mono text-sm h-64 overflow-auto">
                      <pre className="whitespace-pre-wrap">
                        {selectedProcess.stderr}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : loadingProcessId === selectedProcessId ? (
              <div className="text-center text-muted-foreground">
                <p>Loading process details...</p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <p>Failed to load process details. Please try again.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProcessesTab;
