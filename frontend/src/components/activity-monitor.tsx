import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Bot, Server, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ExecutionProcessSummary,
  ExecutionProcessType,
  TaskInfoByAttemptResponse,
} from '../../../shared/types';

interface ActivityMonitorProps {
  refreshInterval?: number;
}

interface ProcessWithTaskInfo extends ExecutionProcessSummary {
  taskInfo?: TaskInfoByAttemptResponse;
}

const API_BASE_URL = '/api';

export function ActivityMonitor({
  refreshInterval = 3000,
}: ActivityMonitorProps) {
  const navigate = useNavigate();
  const [runningProcesses, setRunningProcesses] = useState<
    ProcessWithTaskInfo[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTaskInfo = async (
    taskAttemptId: string
  ): Promise<TaskInfoByAttemptResponse | null> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/task-info-by-attempt/${taskAttemptId}`
      );
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.success && data.data ? data.data : null;
    } catch (err) {
      console.error('Error fetching task info:', err);
      return null;
    }
  };

  const fetchRunningProcesses = async () => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/running-processes`);

      if (!response.ok) {
        throw new Error('Failed to fetch running processes');
      }

      const data = await response.json();

      if (data.success && data.data) {
        // Fetch task info for each process
        const processesWithTaskInfo: ProcessWithTaskInfo[] = await Promise.all(
          data.data.map(async (process: ExecutionProcessSummary) => {
            const taskInfo = await fetchTaskInfo(process.task_attempt_id);
            return { ...process, taskInfo };
          })
        );
        setRunningProcesses(processesWithTaskInfo);
      } else {
        setRunningProcesses([]);
      }
    } catch (err) {
      console.error('Error fetching running processes:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setRunningProcesses([]);
    }
  };

  const handleProcessClick = (process: ProcessWithTaskInfo) => {
    if (process.taskInfo) {
      navigate(
        `/projects/${process.taskInfo.project_id}/tasks/${process.taskInfo.task_id}`
      );
    }
  };

  useEffect(() => {
    // Initial fetch
    setIsLoading(true);
    fetchRunningProcesses().finally(() => setIsLoading(false));

    // Set up polling
    const interval = setInterval(fetchRunningProcesses, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  const getProcessIcon = (processType: ExecutionProcessType) => {
    switch (processType) {
      case 'codingagent':
        return <Bot className="h-3 w-3" />;
      case 'devserver':
        return <Server className="h-3 w-3" />;
      case 'setupscript':
        return <Loader2 className="h-3 w-3" />;
      default:
        return <Activity className="h-3 w-3" />;
    }
  };

  const getProcessLabel = (processType: ExecutionProcessType) => {
    switch (processType) {
      case 'codingagent':
        return 'Agent';
      case 'devserver':
        return 'Dev Server';
      case 'setupscript':
        return 'Setup';
      default:
        return 'Process';
    }
  };

  const getProcessVariant = (processType: ExecutionProcessType) => {
    switch (processType) {
      case 'codingagent':
        return 'default' as const;
      case 'devserver':
        return 'secondary' as const;
      case 'setupscript':
        return 'outline' as const;
      default:
        return 'outline' as const;
    }
  };

  const runningCount = runningProcesses.length;
  const agentCount = runningProcesses.filter(
    (p) => p.process_type === 'codingagent'
  ).length;
  const devServerCount = runningProcesses.filter(
    (p) => p.process_type === 'devserver'
  ).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Activity className="mr-2 h-4 w-4" />
          Activity
          {runningCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {runningCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">
              {runningCount > 0 ? 'Running Activity' : 'Activity Monitor'}
            </h4>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          {runningCount > 0 && (
            <div className="mt-2 flex gap-2">
              {agentCount > 0 && (
                <Badge variant="default" className="text-xs">
                  <Bot className="mr-1 h-3 w-3" />
                  {agentCount} Agent{agentCount > 1 ? 's' : ''}
                </Badge>
              )}
              {devServerCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Server className="mr-1 h-3 w-3" />
                  {devServerCount} Server{devServerCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}
          {runningCount === 0 && !isLoading && !error && (
            <div className="mt-2 text-xs text-muted-foreground">
              System is idle
            </div>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto">
          {error && (
            <div className="p-4 text-sm text-red-600">Error: {error}</div>
          )}

          {runningCount === 0 && !error && !isLoading && (
            <div className="p-6 text-center">
              <Activity className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <div className="text-sm font-medium text-muted-foreground mb-1">
                No Active Processes
              </div>
              <div className="text-xs text-muted-foreground">
                Agents and dev servers will appear here when running
              </div>
            </div>
          )}

          {runningProcesses.map((process) => (
            <div
              key={process.id}
              className={`border-b last:border-b-0 p-3 ${
                process.taskInfo
                  ? 'cursor-pointer hover:bg-muted/50 transition-colors'
                  : ''
              }`}
              onClick={() => handleProcessClick(process)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getProcessIcon(process.process_type)}
                  <div>
                    <div className="text-sm font-medium">
                      {getProcessLabel(process.process_type)}
                      {process.taskInfo && (
                        <span className="ml-2 text-muted-foreground">
                          • {process.taskInfo.task_title}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {process.command}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={getProcessVariant(process.process_type)}>
                    {process.status}
                  </Badge>
                  {process.process_type === 'codingagent' && (
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                  )}
                </div>
              </div>

              {process.args && process.args.trim().length > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Args: {process.args}
                </div>
              )}

              <div className="mt-1 text-xs text-muted-foreground">
                Started: {new Date(process.started_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
