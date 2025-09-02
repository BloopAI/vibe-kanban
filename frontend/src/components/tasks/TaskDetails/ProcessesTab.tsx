import { useState, useEffect } from 'react';
import {
  Play,
  Square,
  AlertCircle,
  CheckCircle,
  Clock,
  Cog,
  ArrowLeft,
} from 'lucide-react';
import { executionProcessesApi } from '@/lib/api.ts';
import { ProfileVariantBadge } from '@/components/common/ProfileVariantBadge.tsx';
import { useAttemptExecution } from '@/hooks';
import ProcessLogsViewer from './ProcessLogsViewer';
import type { ExecutionProcessStatus, ExecutionProcess } from 'shared/types';

import { useProcessSelection } from '@/contexts/ProcessSelectionContext';

interface ProcessesTabProps {
  attemptId?: string;
}

function ProcessesTab({ attemptId }: ProcessesTabProps) {
  const { attemptData } = useAttemptExecution(attemptId);
  const { selectedProcessId, setSelectedProcessId } = useProcessSelection();
  const [loadingProcessId, setLoadingProcessId] = useState<string | null>(null);
  const [localProcessDetails, setLocalProcessDetails] = useState<
    Record<string, ExecutionProcess>
  >({});

  const getStatusIcon = (status: ExecutionProcessStatus) => {
    switch (status) {
      case 'running':
        return <Play className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
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
        setLocalProcessDetails((prev) => ({
          ...prev,
          [processId]: result,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch process details:', err);
    } finally {
      setLoadingProcessId(null);
    }
  };

  // Automatically fetch process details when selectedProcessId changes
  useEffect(() => {
    if (
      selectedProcessId &&
      !attemptData.runningProcessDetails[selectedProcessId] &&
      !localProcessDetails[selectedProcessId]
    ) {
      fetchProcessDetails(selectedProcessId);
    }
  }, [
    selectedProcessId,
    attemptData.runningProcessDetails,
    localProcessDetails,
  ]);

  const handleProcessClick = async (process: ExecutionProcess) => {
    setSelectedProcessId(process.id);

    // If we don't have details for this process, fetch them
    if (
      !attemptData.runningProcessDetails[process.id] &&
      !localProcessDetails[process.id]
    ) {
      await fetchProcessDetails(process.id);
    }
  };

  const selectedProcess = selectedProcessId
    ? attemptData.runningProcessDetails[selectedProcessId] ||
      localProcessDetails[selectedProcessId]
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
        <div className="flex-1 overflow-auto px-4 pb-20 pt-4">
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
                        {process.run_reason}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Process ID: {process.id}
                      </p>
                      {process.dropped && (
                        <span
                          className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200"
                          title="Deleted by restore: timeline was restored to a checkpoint and later executions were removed"
                        >
                          Deleted
                        </span>
                      )}
                      {
                        <p className="text-sm text-muted-foreground mt-1">
                          Profile:{' '}
                          {process.executor_action.typ.type ===
                            'CodingAgentInitialRequest' ||
                          process.executor_action.typ.type ===
                            'CodingAgentFollowUpRequest' ? (
                            <ProfileVariantBadge
                              profileVariant={
                                process.executor_action.typ.executor_profile_id
                              }
                            />
                          ) : null}
                        </p>
                      }
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
                  <div className="mt-1">Process ID: {process.id}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
            <h2 className="text-lg font-semibold">Process Details</h2>
            <button
              onClick={() => setSelectedProcessId(null)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md border border-border transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to list
            </button>
          </div>
          <div className="flex-1">
            {selectedProcess ? (
              <ProcessLogsViewer processId={selectedProcess.id} />
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
