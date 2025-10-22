import { useTranslation } from 'react-i18next';
import { Eye, FileDiff, X } from 'lucide-react';
import { Button } from '../ui/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import type { LayoutMode } from '../layout/TasksLayout';
import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/ActionsDropdown';
import { usePostHog } from 'posthog-js/react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface AttemptHeaderActionsProps {
  onClose: () => void;
  mode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  task: TaskWithAttemptStatus;
  attempt?: TaskAttempt | null;
}

export const AttemptHeaderActions = ({
  onClose,
  mode,
  onModeChange,
  task,
  attempt,
}: AttemptHeaderActionsProps) => {
  const { t } = useTranslation('tasks');
  const posthog = usePostHog();
  const isXL = useMediaQuery('(min-width: 1280px)');

  return (
    <>
      {typeof mode !== 'undefined' && onModeChange && isXL && (
        <TooltipProvider>
          <ToggleGroup
            type="single"
            value={mode ?? ''}
            onValueChange={(v) => {
              const newMode = (v as LayoutMode) || null;

              // Track view navigation
              if (newMode === 'preview') {
                posthog?.capture('preview_navigated', {
                  trigger: 'button',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              } else if (newMode === 'diffs') {
                posthog?.capture('diffs_navigated', {
                  trigger: 'button',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              } else if (newMode === null) {
                // Closing the view (clicked active button)
                posthog?.capture('view_closed', {
                  trigger: 'button',
                  from_view: mode ?? 'attempt',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              }

              onModeChange(newMode);
            }}
            className="inline-flex gap-4"
            aria-label="Layout mode"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="preview"
                  aria-label="Preview"
                  active={mode === 'preview'}
                >
                  <Eye className="h-4 w-4" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('attemptHeaderActions.preview')}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="diffs"
                  aria-label="Diffs"
                  active={mode === 'diffs'}
                >
                  <FileDiff className="h-4 w-4" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('attemptHeaderActions.diffs')}
              </TooltipContent>
            </Tooltip>
          </ToggleGroup>
        </TooltipProvider>
      )}
      {typeof mode !== 'undefined' && onModeChange && isXL && (
        <div className="h-4 w-px bg-border" />
      )}
      <ActionsDropdown task={task} attempt={attempt} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
