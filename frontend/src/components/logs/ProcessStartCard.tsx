import {
  Clock,
  Cog,
  Play,
  Terminal,
  Code,
  ChevronDown,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessStartPayload } from '@/types/logs';

interface ProcessStartCardProps {
  payload: ProcessStartPayload;
  isCollapsed: boolean;
  onToggle: (processId: string) => void;
  onRestore?: (processId: string) => void;
  restoreProcessId?: string; // explicit id if payload lacks it in future
  restoreDisabled?: boolean;
  restoreDisabledReason?: string;
}

function ProcessStartCard({
  payload,
  isCollapsed,
  onToggle,
  onRestore,
  restoreProcessId,
  restoreDisabled,
  restoreDisabledReason,
}: ProcessStartCardProps) {
  const getProcessIcon = (runReason: string) => {
    switch (runReason) {
      case 'setupscript':
        return <Cog className="h-4 w-4" />;
      case 'cleanupscript':
        return <Terminal className="h-4 w-4" />;
      case 'codingagent':
        return <Code className="h-4 w-4" />;
      case 'devserver':
        return <Play className="h-4 w-4" />;
      default:
        return <Cog className="h-4 w-4" />;
    }
  };

  const getProcessLabel = (runReason: string) => {
    switch (runReason) {
      case 'setupscript':
        return 'Setup Script';
      case 'cleanupscript':
        return 'Cleanup Script';
      case 'codingagent':
        return 'Coding Agent';
      case 'devserver':
        return 'Dev Server';
      default:
        return runReason;
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString();
  };

  const handleClick = () => {
    onToggle(payload.processId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(payload.processId);
    }
  };

  return (
    <div className="px-4 pt-4 pb-2">
      <div
        className="p-2 cursor-pointer select-none hover:bg-muted/70 transition-colors"
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2 text-foreground">
            {getProcessIcon(payload.runReason)}
            <span className="font-medium">
              {getProcessLabel(payload.runReason)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatTime(payload.startedAt)}</span>
          </div>
          {onRestore && payload.runReason === 'codingagent' && (
            <button
              className={cn(
                'ml-2 group w-20 flex items-center gap-1 px-1.5 py-1 rounded transition-colors',
                restoreDisabled
                  ? 'cursor-not-allowed text-muted-foreground/60 bg-muted/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (restoreDisabled) return;
                onRestore(restoreProcessId || payload.processId);
              }}
              title={
                restoreDisabled
                  ? restoreDisabledReason || 'Restore is currently unavailable.'
                  : 'Restore to this checkpoint (deletes later history)'
              }
              aria-label="Restore to this checkpoint"
              disabled={!!restoreDisabled}
            >
              <History className="h-4 w-4" />
              <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                Restore
              </span>
            </button>
          )}
          <div
            className={`ml-auto text-xs px-2 py-1 rounded-full ${
              payload.status === 'running'
                ? 'bg-blue-100 text-blue-700'
                : payload.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : payload.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
            }`}
          >
            {payload.status}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isCollapsed && '-rotate-90'
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default ProcessStartCard;
