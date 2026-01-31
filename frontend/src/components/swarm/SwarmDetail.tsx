import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Play,
  Pause,
  Settings,
  Loader2,
} from 'lucide-react';
import { SwarmKanban } from './SwarmKanban';
import { SwarmPool } from './SwarmPool';
import { SwarmChat } from './SwarmChat';
import { SwarmMonitor } from './SwarmMonitor';
import type { Swarm, SwarmTask, SwarmChatMessage, Sandbox } from './types';
import { SWARM_STATUS_CONFIG } from './constants';

interface SwarmDetailProps {
  swarm: Swarm;
  tasks: SwarmTask[];
  messages: SwarmChatMessage[];
  sandboxes: Sandbox[];
  logs: string[];
  isLoading?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onSettings?: () => void;
  onCreateTask?: () => void;
  onSendMessage?: (message: string) => void;
  onViewExecution?: (taskId: string) => void;
  onRetryTask?: (taskId: string) => void;
  onCancelTask?: (taskId: string) => void;
  onDestroySandbox?: (id: string) => void;
  onCleanupIdle?: () => void;
}

export function SwarmDetail({
  swarm,
  tasks,
  messages,
  sandboxes,
  logs,
  isLoading = false,
  onPause,
  onResume,
  onSettings,
  onCreateTask,
  onSendMessage,
  onViewExecution,
  onRetryTask,
  onCancelTask,
  onDestroySandbox,
  onCleanupIdle,
}: SwarmDetailProps) {
  const navigate = useNavigate();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isMonitorMinimized, setIsMonitorMinimized] = useState(false);

  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) || null
    : null;
  const selectedSandbox = selectedTask
    ? sandboxes.find((s) => s.current_task_id === selectedTask.id)
    : null;

  const config = SWARM_STATUS_CONFIG[swarm.status];

  const handleViewExecution = (taskId: string) => {
    setSelectedTaskId(taskId);
    setIsMonitorMinimized(false);
    onViewExecution?.(taskId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/swarms')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Swarms
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="font-semibold">{swarm.name}</h1>
          <Badge className={config.className}>{config.label}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {swarm.status === 'active' ? (
            <Button variant="outline" size="sm" onClick={onPause}>
              <Pause className="h-4 w-4 mr-1" />
              Pause
            </Button>
          ) : swarm.status === 'paused' ? (
            <Button variant="outline" size="sm" onClick={onResume}>
              <Play className="h-4 w-4 mr-1" />
              Resume
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onSettings}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content - Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Kanban (60%) */}
        <div className="flex-[6] border-r overflow-hidden">
          <SwarmKanban
            tasks={tasks}
            sandboxes={sandboxes}
            onCreateTask={onCreateTask}
            onViewExecution={handleViewExecution}
            onRetryTask={onRetryTask}
          />
        </div>

        {/* Right: Side Panel (40%) */}
        <div className="flex-[4] flex flex-col overflow-hidden">
          {/* Pool */}
          <div className="p-4 border-b">
            <SwarmPool
              sandboxes={sandboxes}
              tasks={tasks}
              onDestroySandbox={onDestroySandbox}
              onCleanupIdle={onCleanupIdle}
            />
          </div>

          {/* Chat */}
          <div className="flex-1 p-4 overflow-hidden">
            <SwarmChat
              messages={messages}
              onSendMessage={onSendMessage}
            />
          </div>
        </div>
      </div>

      {/* Bottom: Monitor */}
      <div className="border-t p-4">
        <SwarmMonitor
          task={selectedTask}
          sandbox={selectedSandbox}
          logs={logs}
          isMinimized={isMonitorMinimized}
          onMinimize={() => setIsMonitorMinimized(true)}
          onMaximize={() => setIsMonitorMinimized(false)}
          onCancel={() => selectedTaskId && onCancelTask?.(selectedTaskId)}
          onRetry={() => selectedTaskId && onRetryTask?.(selectedTaskId)}
          onCopyLogs={() => navigator.clipboard.writeText(logs.join('\n'))}
        />
      </div>
    </div>
  );
}
