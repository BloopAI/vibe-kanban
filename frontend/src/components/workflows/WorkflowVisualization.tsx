import { memo } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { WorkflowStage, WorkflowStatus, AgentStatus } from 'shared/types';
import {
  useWorkflowProgress,
  useAgentStatus,
  formatDuration,
  getStageDisplayName,
  getStatusColor,
} from '@/hooks/useWorkflows';
import { cn } from '@/lib/utils';

interface WorkflowVisualizationProps {
  taskId: string;
  compact?: boolean;
}

interface StageIndicatorProps {
  stage: WorkflowStage;
  status: WorkflowStatus;
  agentStatus: AgentStatus;
  duration: number | null;
  isCurrent: boolean;
  compact: boolean;
}

function StageIndicator({
  stage,
  status,
  agentStatus,
  duration,
  isCurrent,
  compact,
}: StageIndicatorProps) {
  const getStatusIcon = () => {
    if (status === 'completed') {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    }
    if (status === 'failed') {
      return <XCircle className="h-5 w-5 text-red-600" />;
    }
    if (status === 'in_progress' || agentStatus === 'running') {
      return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
    }
    if (status === 'skipped') {
      return <AlertTriangle className="h-5 w-5 text-gray-400" />;
    }
    return <Circle className="h-5 w-5 text-gray-400" />;
  };

  const getStageColor = () => {
    if (status === 'completed') return 'border-green-500';
    if (status === 'failed') return 'border-red-500';
    if (status === 'in_progress') return 'border-blue-500';
    return 'border-gray-300';
  };

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all',
          getStageColor(),
          isCurrent && 'bg-blue-50 dark:bg-blue-950'
        )}
      >
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStageDisplayName(stage)}</span>
        {agentStatus === 'running' && (
          <Badge variant="outline" className="ml-auto text-xs">
            Active
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 p-4 rounded-lg border-2 transition-all',
        getStageColor(),
        isCurrent && 'bg-blue-50 dark:bg-blue-950 shadow-md'
      )}
    >
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div className="flex-1">
          <h4 className="font-semibold text-sm">{getStageDisplayName(stage)}</h4>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={cn('text-xs', getStatusColor(status))}>
              {status}
            </Badge>
            {agentStatus !== 'idle' && (
              <Badge variant="outline" className="text-xs">
                Agent: {agentStatus}
              </Badge>
            )}
          </div>
        </div>
        {duration !== null && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(duration)}</span>
          </div>
        )}
      </div>

      {isCurrent && status === 'in_progress' && (
        <div className="mt-2">
          <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 animate-pulse rounded-full w-1/2" />
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowVisualization({
  taskId,
  compact = false,
}: WorkflowVisualizationProps) {
  const { state: progressState } = useWorkflowProgress(taskId);
  const { state: agentState } = useAgentStatus(taskId);

  if (progressState.status === 'loading' || agentState.status === 'loading') {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">
          Loading workflow...
        </span>
      </div>
    );
  }

  if (progressState.status === 'error' || agentState.status === 'error') {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        <span className="text-sm text-red-700">
          Failed to load workflow progress
        </span>
      </div>
    );
  }

  if (progressState.status !== 'success' || agentState.status !== 'success') {
    return null;
  }

  const workflow = progressState.data;
  const agentStatuses = agentState.data;

  const stages: WorkflowStage[] = [
    WorkflowStage.RESEARCH,
    WorkflowStage.IMPLEMENT,
    WorkflowStage.CI_CD,
    WorkflowStage.REVIEW,
  ];

  const getStageProgress = (stage: WorkflowStage) => {
    return workflow.stages.find((s) => s.stage === stage);
  };

  const calculateOverallProgress = () => {
    const totalStages = workflow.stages.length;
    const completedStages = workflow.stages.filter(
      (s) => s.status === 'completed'
    ).length;
    return (completedStages / totalStages) * 100;
  };

  const overallProgress = calculateOverallProgress();

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Workflow Progress</span>
          <Badge variant="outline" className="text-xs">
            {Math.round(overallProgress)}%
          </Badge>
        </div>
        <div className="flex gap-2">
          {stages.map((stage) => {
            const stageProgress = getStageProgress(stage);
            return (
              <StageIndicator
                key={stage}
                stage={stage}
                status={stageProgress?.status || 'pending'}
                agentStatus={
                  agentStatuses[stage] ||
                  workflow.stages.find((s) => s.stage === stage)?.agent_status ||
                  'idle'
                }
                duration={stageProgress?.duration_seconds || null}
                isCurrent={workflow.current_stage === stage}
                compact={compact}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Workflow Progress</h3>
          <p className="text-sm text-muted-foreground">
            {workflow.status === 'in_progress'
              ? 'Currently executing...'
              : workflow.status === 'completed'
              ? 'Completed successfully'
              : workflow.status === 'failed'
              ? 'Failed'
              : 'Pending'}
          </p>
        </div>
        <div className="text-right">
          <Badge
            className={cn('text-sm', getStatusColor(workflow.status))}
            variant="outline"
          >
            {workflow.status}
          </Badge>
          {workflow.started_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Started:{' '}
              {new Date(workflow.started_at).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Overall Progress</span>
          <span className="text-muted-foreground">
            {Math.round(overallProgress)}%
          </span>
        </div>
        <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500 rounded-full',
              workflow.status === 'failed'
                ? 'bg-red-600'
                : workflow.status === 'completed'
                ? 'bg-green-600'
                : 'bg-blue-600'
            )}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Stage Flow Chart */}
      <div className="space-y-3">
        {stages.map((stage, index) => {
          const stageProgress = getStageProgress(stage);
          return (
            <div key={stage} className="relative">
              <StageIndicator
                stage={stage}
                status={stageProgress?.status || 'pending'}
                agentStatus={
                  agentStatuses[stage] || stageProgress?.agent_status || 'idle'
                }
                duration={stageProgress?.duration_seconds || null}
                isCurrent={workflow.current_stage === stage}
                compact={compact}
              />
              {index < stages.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="w-0.5 h-4 bg-gray-300 dark:bg-gray-600" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error Message */}
      {workflow.error_message && (
        <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200">
          <p className="text-sm text-red-700">{workflow.error_message}</p>
        </div>
      )}

      {/* Footer Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
        <div>
          <span className="font-medium">Stages Completed:</span>{' '}
          {workflow.stages.filter((s) => s.status === 'completed').length} /{' '}
          {workflow.stages.length}
        </div>
        {workflow.completed_at && (
          <div>
            <span className="font-medium">Total Time:</span>{' '}
            {formatDuration(
              Math.floor(
                (new Date(workflow.completed_at).getTime() -
                  new Date(workflow.started_at || '').getTime()) /
                  1000
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(WorkflowVisualization);
