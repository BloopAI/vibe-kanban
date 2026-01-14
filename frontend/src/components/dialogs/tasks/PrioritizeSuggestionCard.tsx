import { useTranslation } from 'react-i18next';
import { Check, X, ArrowRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PriorityIndicator } from '@/components/tasks/TaskMetadata';
import type { PrioritySuggestion } from '@/lib/prioritization';
import type { TaskPriority } from 'shared/types';

interface PrioritizeSuggestionCardProps {
  suggestion: PrioritySuggestion;
  onAccept: () => void;
  onReject: () => void;
}

const priorityLabels: Record<TaskPriority, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function PrioritizeSuggestionCard({
  suggestion,
  onAccept,
  onReject,
}: PrioritizeSuggestionCardProps) {
  const { t } = useTranslation('tasks');
  const { task, currentPriority, suggestedPriority, reasons, accepted } =
    suggestion;

  const isAccepted = accepted === true;
  const isRejected = accepted === false;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 border-b transition-colors',
        isAccepted && 'bg-green-500/5',
        isRejected && 'bg-muted/50 opacity-60'
      )}
    >
      {/* Task info */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium line-clamp-1">{task.title}</span>
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {task.description}
          </p>
        )}
      </div>

      {/* Priority comparison */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1">
          {currentPriority === 'none' ? (
            <span className="text-xs text-muted-foreground">
              {priorityLabels.none}
            </span>
          ) : (
            <PriorityIndicator priority={currentPriority} showLabel />
          )}
        </div>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <div className="flex items-center gap-1">
          {suggestedPriority === 'none' ? (
            <span className="text-xs text-muted-foreground">
              {priorityLabels.none}
            </span>
          ) : (
            <PriorityIndicator priority={suggestedPriority} showLabel />
          )}
        </div>
      </div>

      {/* Explanation tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            aria-label={t('prioritize.viewReasons', 'View reasons')}
          >
            <Info className="h-4 w-4 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <p className="font-medium text-xs mb-1">
            {t('prioritize.whySuggested', 'Why this priority?')}
          </p>
          <ul className="text-xs space-y-0.5">
            {reasons.map((reason, idx) => (
              <li key={idx} className="text-muted-foreground">
                {reason.explanation}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>

      {/* Accept/Reject buttons */}
      <div className="flex gap-1 shrink-0">
        <Button
          variant={isAccepted ? 'default' : 'ghost'}
          size="sm"
          className={cn(
            'h-7 w-7 p-0',
            isAccepted && 'bg-green-600 hover:bg-green-700'
          )}
          onClick={onAccept}
          disabled={isAccepted}
          aria-label={t('prioritize.accept', 'Accept suggestion')}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant={isRejected ? 'default' : 'ghost'}
          size="sm"
          className={cn(
            'h-7 w-7 p-0',
            isRejected && 'bg-destructive hover:bg-destructive/90'
          )}
          onClick={onReject}
          disabled={isRejected}
          aria-label={t('prioritize.reject', 'Reject suggestion')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
