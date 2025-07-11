import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Chip } from '@/components/ui/chip';
import { NormalizedConversationViewer } from './TaskDetails/NormalizedConversationViewer.tsx';
import type {
  ExecutionProcess,
  TaskAttempt,
  TaskAttemptActivityWithPrompt,
  TaskAttemptStatus,
} from 'shared/types';

interface TaskActivityHistoryProps {
  selectedAttempt: TaskAttempt | null;
  activities: TaskAttemptActivityWithPrompt[];
  runningProcessDetails: Record<string, ExecutionProcess>;
}

const getAttemptStatusDisplay = (
  status: TaskAttemptStatus
): { label: string; dotColor: string } => {
  switch (status) {
    case 'setuprunning':
      return {
        label: 'Setup Running',
        dotColor: 'bg-blue-500',
      };
    case 'setupcomplete':
      return {
        label: 'Setup Complete',
        dotColor: 'bg-green-500',
      };
    case 'setupfailed':
      return {
        label: 'Setup Failed',
        dotColor: 'bg-red-500',
      };
    case 'executorrunning':
      return {
        label: 'Executor Running',
        dotColor: 'bg-blue-500',
      };
    case 'executorcomplete':
      return {
        label: 'Executor Complete',
        dotColor: 'bg-green-500',
      };
    case 'executorfailed':
      return {
        label: 'Executor Failed',
        dotColor: 'bg-red-500',
      };
    default:
      return {
        label: 'Unknown',
        dotColor: 'bg-gray-400',
      };
  }
};

export function TaskActivityHistory({
  selectedAttempt,
  activities,
  runningProcessDetails,
}: TaskActivityHistoryProps) {
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(
    new Set()
  );

  const toggleOutputExpansion = (processId: string) => {
    setExpandedOutputs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(processId)) {
        newSet.delete(processId);
      } else {
        newSet.add(processId);
      }
      return newSet;
    });
  };

  if (!selectedAttempt) {
    return null;
  }

  return (
    <div>
      <Label className="text-sm font-medium mb-3 block">Activity History</Label>
      {activities.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          No activities found
        </div>
      ) : (
        <div className="space-y-2">
          {/* Fake worktree created activity */}
          <div key="worktree-created">
            <div className="flex items-center gap-3 my-4 rounded-md">
              <Chip dotColor="bg-green-500">New Worktree</Chip>
              <span className="text-sm text-muted-foreground flex-1">
                {selectedAttempt.worktree_path}
              </span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(selectedAttempt.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
            </div>
          </div>
          {activities.slice().map((activity) => (
            <div key={activity.id}>
              {/* Compact activity message */}
              <div className="flex items-center gap-3 my-4 rounded-md">
                <Chip
                  dotColor={getAttemptStatusDisplay(activity.status).dotColor}
                >
                  {getAttemptStatusDisplay(activity.status).label}
                </Chip>
                {activity.note && (
                  <span className="text-sm text-muted-foreground flex-1">
                    {activity.note}
                  </span>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(activity.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </div>
              </div>

              {/* Show prompt for coding agent executions */}
              {activity.prompt && activity.status === 'executorrunning' && (
                <div className="mt-2 mb-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-2 mb-2">
                      <Code className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                      <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Prompt
                      </span>
                    </div>
                    <pre className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap break-words">
                      {activity.prompt}
                    </pre>
                  </div>
                </div>
              )}

              {/* Show stdio output for running processes */}
              {(activity.status === 'setuprunning' ||
                activity.status === 'executorrunning') &&
                runningProcessDetails[activity.execution_process_id] && (
                  <div className="mt-2">
                    <div
                      className={`transition-all duration-200 ${
                        expandedOutputs.has(activity.execution_process_id)
                          ? ''
                          : 'max-h-64 overflow-hidden flex flex-col justify-end'
                      }`}
                    >
                      <NormalizedConversationViewer
                        executionProcess={
                          runningProcessDetails[activity.execution_process_id]
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        toggleOutputExpansion(activity.execution_process_id)
                      }
                      className="mt-2 p-0 h-auto text-xs text-muted-foreground hover:text-foreground"
                    >
                      {expandedOutputs.has(activity.execution_process_id) ? (
                        <>
                          <ChevronUp className="h-3 w-3 mr-1" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Show more
                        </>
                      )}
                    </Button>
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
