import { useState } from 'react';
import { Eye, GitCompareArrows, X, MoreHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { LayoutMode } from '../layout/TasksLayout';
import type { TaskAttempt } from 'shared/types';
import { CreateAttemptDialog } from '../dialogs/tasks/CreateAttemptDialog';

interface AttemptHeaderActionsProps {
  onClose: () => void;
  mode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  taskId: string;
  latestAttempt?: TaskAttempt | null;
  onCreateSubtask?: () => void;
}

export const AttemptHeaderActions = ({
  onClose,
  mode,
  onModeChange,
  taskId,
  latestAttempt,
  onCreateSubtask,
}: AttemptHeaderActionsProps) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <>
      {typeof mode !== 'undefined' && onModeChange && (
        <TooltipProvider>
          <ToggleGroup
            type="single"
            value={mode ?? ''}
            onValueChange={(v) => onModeChange((v as LayoutMode) || null)}
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
              <TooltipContent side="bottom">Preview</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="diffs"
                  aria-label="Diffs"
                  active={mode === 'diffs'}
                >
                  <GitCompareArrows className="h-4 w-4" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">Diffs</TooltipContent>
            </Tooltip>
          </ToggleGroup>
        </TooltipProvider>
      )}
      {typeof mode !== 'undefined' && onModeChange && (
        <div className="h-4 w-px bg-border" />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="icon" aria-label="More actions">
            <MoreHorizontal size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              console.log('Open attempt in IDE');
            }}
          >
            Open attempt in IDE
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              console.log('View processes');
            }}
          >
            View processes
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setIsCreateOpen(true);
            }}
          >
            Create new attempt
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCreateSubtask?.();
            }}
            disabled={!onCreateSubtask}
          >
            Create subtask
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>

      <CreateAttemptDialog
        taskId={taskId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        latestAttempt={latestAttempt ?? null}
      />
    </>
  );
};
