import { useTranslation } from 'react-i18next';
import { ExternalLink, Eye, FileDiff, GitPullRequest, X } from 'lucide-react';
import { Button } from '../ui/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import type { LayoutMode } from '../layout/TasksLayout';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { Workspace } from 'shared/types';
import { ActionsDropdown } from '../ui/actions-dropdown';
import { usePostHog } from 'posthog-js/react';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';

interface AttemptHeaderActionsProps {
  onClose: () => void;
  mode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  task: TaskWithAttemptStatus;
  attempt?: Workspace | null;
  sharedTask?: SharedTaskRecord;
}

export const AttemptHeaderActions = ({
  onClose,
  mode,
  onModeChange,
  task,
  attempt,
  sharedTask,
}: AttemptHeaderActionsProps) => {
  const { t } = useTranslation('tasks');
  const posthog = usePostHog();

  return (
    <>
      {typeof mode !== 'undefined' && onModeChange && (
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
            {/* {attempt?.id && (
              <>
                <div className="h-4 w-px bg-border" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={`/workspaces/${attempt.id}`}
                      className="inline-flex items-center justify-center text-primary-foreground/70 hover:text-accent-foreground"
                      aria-label="Try the new UI"
                    >
                      <Sparkles className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t('attemptHeaderActions.tryNewUI')}
                  </TooltipContent>
                </Tooltip>
              </>
            )} */}
          </ToggleGroup>
        </TooltipProvider>
      )}
      {task.open_pr && (
        <>
          <div className="h-4 w-px bg-border" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => window.open(task.open_pr!.url, '_blank')}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100/60 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs hover:underline"
                  aria-label={t('git.pr.open', { number: task.open_pr.number })}
                >
                  <GitPullRequest className="h-3.5 w-3.5" />
                  {t('git.pr.number', { number: task.open_pr.number })}
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('git.pr.open', { number: task.open_pr.number })}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
      {typeof mode !== 'undefined' && onModeChange && (
        <div className="h-4 w-px bg-border" />
      )}
      <ActionsDropdown task={task} attempt={attempt} sharedTask={sharedTask} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
