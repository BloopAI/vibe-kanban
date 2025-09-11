import { ChevronDown, SquarePen, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ProcessStartPayload } from '@/types/logs';
import type { ExecutorAction } from 'shared/types';
import { PROCESS_RUN_REASONS } from '@/constants/processes';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AutoExpandingTextarea } from '@/components/ui/auto-expanding-textarea';

interface ProcessStartCardProps {
  payload: ProcessStartPayload;
  isCollapsed: boolean;
  onToggle: (processId: string) => void;
  // Retry flow (replaces restore): edit prompt then retry
  onRetry?: (processId: string, newPrompt: string) => void;
  retryProcessId?: string; // explicit id if payload lacks it in future
  retryDisabled?: boolean;
  retryDisabledReason?: string;
}

const extractPromptFromAction = (
  action?: ExecutorAction | null
): string | null => {
  if (!action) return null;
  const t = action.typ;
  if (!t) return null;
  if (
    (t.type === 'CodingAgentInitialRequest' ||
      t.type === 'CodingAgentFollowUpRequest') &&
    typeof t.prompt === 'string' &&
    t.prompt.trim()
  ) {
    return t.prompt;
  }
  return null;
};

function ProcessStartCard({
  payload,
  isCollapsed,
  onToggle,
  onRetry,
  retryProcessId,
  retryDisabled,
  retryDisabledReason,
}: ProcessStartCardProps) {
  const getProcessLabel = (p: ProcessStartPayload) => {
    if (p.runReason === PROCESS_RUN_REASONS.CODING_AGENT) {
      const prompt = extractPromptFromAction(p.action);
      return prompt || 'Coding Agent';
    }
    switch (p.runReason) {
      case PROCESS_RUN_REASONS.SETUP_SCRIPT:
        return 'Setup Script';
      case PROCESS_RUN_REASONS.CLEANUP_SCRIPT:
        return 'Cleanup Script';
      case PROCESS_RUN_REASONS.DEV_SERVER:
        return 'Dev Server';
      default:
        return p.runReason;
    }
  };

  const handleClick = () => {
    onToggle(payload.processId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(payload.processId);
    }
  };

  const label = getProcessLabel(payload);
  const shouldTruncate =
    isCollapsed && payload.runReason === PROCESS_RUN_REASONS.CODING_AGENT;

  // Inline edit state for retry flow
  const isCodingAgent = payload.runReason === PROCESS_RUN_REASONS.CODING_AGENT;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);

  useEffect(() => {
    if (!isEditing) setEditValue(label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  const canRetry = useMemo(
    () => !!onRetry && isCodingAgent,
    [onRetry, isCodingAgent]
  );
  const doRetry = () => {
    if (!onRetry) return;
    const prompt = (editValue || '').trim();
    if (!prompt) return; // no-op on empty
    onRetry(retryProcessId || payload.processId, prompt);
    setIsEditing(false);
  };

  return (
    <div
      className="p-2 border cursor-pointer select-none transition-colors w-full bg-background"
      role="button"
      tabIndex={0}
      onClick={() => {
        // Avoid toggling while editing or interacting with controls
        if (isEditing) return;
        handleClick();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-2 text-sm font-light">
        <div className="flex items-center gap-2 text-foreground min-w-0 flex-1">
          {isEditing && canRetry ? (
            <div
              className="flex items-center w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <AutoExpandingTextarea
                value={editValue || ''}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsEditing(false);
                    setEditValue(label);
                  }
                }}
                className={cn(
                  'min-h-[36px] text-sm bg-inherit',
                  shouldTruncate ? 'truncate' : 'whitespace-normal break-words'
                )}
                maxRows={12}
                autoFocus
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                disabled={!!retryDisabled || !(editValue || '').trim()}
                onClick={(e) => {
                  e.stopPropagation();
                  doRetry();
                }}
                aria-label="Confirm edit and retry"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(false);
                  setEditValue(label);
                }}
                area-label="Cancel edit"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <span
                className={cn(
                  shouldTruncate ? 'truncate' : 'whitespace-normal break-words'
                )}
                title={shouldTruncate ? label : undefined}
              >
                {label}
              </span>
            </>
          )}
        </div>

        {/* Right controls: edit icon, status, chevron */}
        {canRetry && !isEditing && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Wrap disabled button so tooltip still works */}
                <span
                  className="ml-2 inline-flex"
                  onClick={(e) => e.stopPropagation()}
                  aria-disabled={retryDisabled ? true : undefined}
                >
                  <button
                    className={cn(
                      'p-1 rounded transition-colors',
                      retryDisabled
                        ? 'cursor-not-allowed text-muted-foreground/60'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (retryDisabled) return;
                      setIsEditing(true);
                      setEditValue(label);
                    }}
                    aria-label="Edit prompt and retry from here"
                    disabled={!!retryDisabled}
                  >
                    <SquarePen className="h-4 w-4" />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {retryDisabled
                  ? retryDisabledReason ||
                    'Unavailable while another process is running.'
                  : 'Edit prompt and retry'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div
          className={cn(
            'ml-1 text-xs px-2 py-1 rounded-full',
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
  );
}

export default ProcessStartCard;
