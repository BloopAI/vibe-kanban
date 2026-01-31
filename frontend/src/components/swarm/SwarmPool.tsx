import { Button } from '@/components/ui/button';
import { Box, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Sandbox, SwarmTask } from './types';

interface SwarmPoolProps {
  sandboxes: Sandbox[];
  tasks: SwarmTask[];
  onDestroySandbox?: (id: string) => void;
  onCleanupIdle?: () => void;
}

const statusConfig = {
  idle: {
    label: 'Idle',
    className: 'bg-muted text-muted-foreground',
    dotClassName: 'bg-muted-foreground',
  },
  busy: {
    label: 'Busy',
    className: 'bg-blue-500/10 text-blue-500',
    dotClassName: 'bg-blue-500',
  },
  destroyed: {
    label: 'Destroyed',
    className: 'bg-destructive/10 text-destructive',
    dotClassName: 'bg-destructive',
  },
};

export function SwarmPool({
  sandboxes,
  tasks,
  onDestroySandbox,
  onCleanupIdle,
}: SwarmPoolProps) {
  const activeSandboxes = sandboxes.filter((s) => s.status !== 'destroyed');
  const idleSandboxes = activeSandboxes.filter((s) => s.status === 'idle');
  const busySandboxes = activeSandboxes.filter((s) => s.status === 'busy');

  const getTaskForSandbox = (sandbox: Sandbox) =>
    tasks.find((t) => t.id === sandbox.current_task_id);

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Pool</h3>
          <span className="text-xs text-muted-foreground">
            {busySandboxes.length}/{activeSandboxes.length} active
          </span>
        </div>
        {idleSandboxes.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onCleanupIdle}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Cleanup Idle
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {activeSandboxes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No active sandboxes
          </p>
        ) : (
          activeSandboxes.map((sandbox) => {
            const config = statusConfig[sandbox.status];
            const task = getTaskForSandbox(sandbox);

            return (
              <div
                key={sandbox.id}
                className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      config.dotClassName,
                      sandbox.status === 'busy' && 'animate-pulse'
                    )}
                  />
                  <span className="font-mono text-xs truncate">
                    {sandbox.daytona_id.slice(0, 12)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {task && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {task.title}
                    </span>
                  )}
                  {sandbox.status === 'busy' && (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                  )}
                  {sandbox.status === 'idle' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onDestroySandbox?.(sandbox.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
