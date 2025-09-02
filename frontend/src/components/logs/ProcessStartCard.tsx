import { Cog, Play, Terminal, ChevronDown, User, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessStartPayload, ExecutorAction } from '@/types/logs';

interface ProcessStartCardProps {
  payload: ProcessStartPayload;
  isCollapsed: boolean;
  onToggle: (processId: string) => void;
  onRestore?: (processId: string) => void;
  restoreProcessId?: string; // explicit id if payload lacks it in future
  restoreDisabled?: boolean;
  restoreDisabledReason?: string;
}

const extractPromptFromAction = (
  action?: ExecutorAction | null
): string | null => {
  console.log(action);
  if (!action) return null;
  const t = action.typ as any;
  if (t && typeof t.prompt === 'string' && t.prompt.trim()) return t.prompt;
  return null;
};

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
        return <User className="h-4 w-4" />;
      case 'devserver':
        return <Play className="h-4 w-4" />;
      default:
        return <Cog className="h-4 w-4" />;
    }
  };

  const getProcessLabel = (p: ProcessStartPayload) => {
    if (p.runReason === 'codingagent') {
      const prompt = extractPromptFromAction(p.action);
      return prompt || 'Coding Agent';
    }
    switch (p.runReason) {
      case 'setupscript':
        return 'Setup Script';
      case 'cleanupscript':
        return 'Cleanup Script';
      case 'devserver':
        return 'Dev Server';
      default:
        return p.runReason;
    }
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

  const label = getProcessLabel(payload);
  const shouldTruncate = isCollapsed && payload.runReason === 'codingagent';

  return (
    <div className="px-4 pt-4 pb-2">
      <div
        className="p-2 cursor-pointer select-none hover:bg-muted/70 transition-colors border rounded-md"
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2 text-foreground min-w-0 flex-1">
            <div className="flex-shrink-0">
              {getProcessIcon(payload.runReason)}
            </div>
            <span
              className={cn(
                'font-medium',
                shouldTruncate ? 'truncate' : 'whitespace-normal break-words'
              )}
              title={shouldTruncate ? label : undefined}
            >
              {label}
            </span>
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
            className={cn(
              'ml-auto text-xs px-2 py-1 rounded-full',
              payload.status === 'running'
                ? 'bg-blue-100 text-blue-700'
                : payload.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : payload.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
            )}
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
