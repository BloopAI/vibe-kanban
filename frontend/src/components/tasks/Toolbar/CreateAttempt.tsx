import { Dispatch, SetStateAction, useCallback, useContext } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ArrowDown, Play, Settings2, X, AlertTriangle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import type { GitBranch, TaskAttempt } from 'shared/types.ts';
import { attemptsApi } from '@/lib/api.ts';
import {
  TaskAttemptDataContext,
  TaskDetailsContext,
} from '@/components/context/taskDetailsContext.ts';
import { useTaskPlan } from '@/components/context/TaskPlanContext.ts';
import { useConfig } from '@/components/config-provider.tsx';
import BranchSelector from '@/components/tasks/BranchSelector.tsx';
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts.ts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { useState } from 'react';

type Props = {
  branches: GitBranch[];
  taskAttempts: TaskAttempt[];
  createAttemptExecutor: string;
  createAttemptBranch: string | null;
  selectedExecutor: string;
  selectedBranch: string | null;
  fetchTaskAttempts: () => void;
  setIsInCreateAttemptMode: Dispatch<SetStateAction<boolean>>;
  setCreateAttemptBranch: Dispatch<SetStateAction<string | null>>;
  setCreateAttemptExecutor: Dispatch<SetStateAction<string>>;
  availableExecutors: {
    id: string;
    name: string;
  }[];
};

function CreateAttempt({
  branches,
  taskAttempts,
  createAttemptExecutor,
  createAttemptBranch,
  selectedExecutor,
  selectedBranch,
  fetchTaskAttempts,
  setIsInCreateAttemptMode,
  setCreateAttemptBranch,
  setCreateAttemptExecutor,
  availableExecutors,
}: Props) {
  const { task, projectId } = useContext(TaskDetailsContext);
  const { isAttemptRunning } = useContext(TaskAttemptDataContext);
  const { isPlanningMode, canCreateTask } = useTaskPlan();
  const { config } = useConfig();

  const [showCreateAttemptConfirmation, setShowCreateAttemptConfirmation] =
    useState(false);
  const [pendingExecutor, setPendingExecutor] = useState<string | undefined>(
    undefined
  );
  const [pendingBaseBranch, setPendingBaseBranch] = useState<
    string | undefined
  >(undefined);

  // Create attempt logic
  const actuallyCreateAttempt = useCallback(
    async (executor?: string, baseBranch?: string) => {
      try {
        await attemptsApi.create(projectId!, task.id, {
          executor: executor || selectedExecutor,
          base_branch: baseBranch || selectedBranch,
        });
        fetchTaskAttempts();
      } catch (error) {
        // Optionally handle error
      }
    },
    [projectId, task.id, selectedExecutor, selectedBranch, fetchTaskAttempts]
  );

  // Handler for Enter key or Start button
  const onCreateNewAttempt = useCallback(
    (executor?: string, baseBranch?: string, isKeyTriggered?: boolean) => {
      if (task.status === 'todo' && isKeyTriggered) {
        setPendingExecutor(executor);
        setPendingBaseBranch(baseBranch);
        setShowCreateAttemptConfirmation(true);
      } else {
        actuallyCreateAttempt(executor, baseBranch);
        setShowCreateAttemptConfirmation(false);
        setIsInCreateAttemptMode(false);
      }
    },
    [task.status, actuallyCreateAttempt, setIsInCreateAttemptMode]
  );

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onEnter: () => {
      if (showCreateAttemptConfirmation) {
        handleConfirmCreateAttempt();
      } else {
        onCreateNewAttempt(
          createAttemptExecutor,
          createAttemptBranch || undefined,
          true
        );
      }
    },
    hasOpenDialog: showCreateAttemptConfirmation,
    closeDialog: () => setShowCreateAttemptConfirmation(false),
  });

  const handleExitCreateAttemptMode = () => {
    setIsInCreateAttemptMode(false);
  };

  const handleCreateAttempt = () => {
    onCreateNewAttempt(createAttemptExecutor, createAttemptBranch || undefined);
  };

  const handleConfirmCreateAttempt = () => {
    actuallyCreateAttempt(pendingExecutor, pendingBaseBranch);
    setShowCreateAttemptConfirmation(false);
    setIsInCreateAttemptMode(false);
  };

  return (
    <div className="p-4 bg-muted/20 rounded-lg border">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Create Attempt</h3>
          {taskAttempts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExitCreateAttemptMode}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center w-4/5">
          <label className="text-xs font-medium text-muted-foreground">
            Each time you start an attempt, a new session is initiated with your
            selected coding agent, and a git worktree and corresponding task
            branch are created.
          </label>
        </div>

        {/* Plan warning when in planning mode without plan */}
        {isPlanningMode && !canCreateTask && (
          <div className="p-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                Plan Required
              </p>
            </div>
            <p className="text-xs text-orange-700 dark:text-orange-400">
              Cannot start attempt - no plan was generated in the last
              execution. Please generate a plan first.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 items-end">
          {/* Step 1: Choose Base Branch */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Base branch
              </label>
            </div>
            <BranchSelector
              branches={branches}
              selectedBranch={createAttemptBranch}
              onBranchSelect={setCreateAttemptBranch}
              placeholder="current"
            />
          </div>

          {/* Step 2: Choose Coding Agent */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Coding agent
              </label>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <Settings2 className="h-3 w-3" />
                    <span className="truncate">
                      {availableExecutors.find(
                        (e) => e.id === createAttemptExecutor
                      )?.name || 'Select agent'}
                    </span>
                  </div>
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                {availableExecutors.map((executor) => (
                  <DropdownMenuItem
                    key={executor.id}
                    onClick={() => setCreateAttemptExecutor(executor.id)}
                    className={
                      createAttemptExecutor === executor.id ? 'bg-accent' : ''
                    }
                  >
                    {executor.name}
                    {config?.executor.type === executor.id && ' (Default)'}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Step 3: Start Attempt */}
          <div className="space-y-1">
            <Button
              onClick={handleCreateAttempt}
              disabled={
                !createAttemptExecutor ||
                isAttemptRunning ||
                (isPlanningMode && !canCreateTask)
              }
              size="sm"
              className={`w-full text-xs gap-2 ${
                isPlanningMode && !canCreateTask
                  ? 'opacity-60 cursor-not-allowed bg-red-600 hover:bg-red-600'
                  : ''
              }`}
              title={
                isPlanningMode && !canCreateTask
                  ? 'Plan required before starting attempt'
                  : undefined
              }
            >
              {isPlanningMode && !canCreateTask && (
                <AlertTriangle className="h-3 w-3 mr-1.5" />
              )}
              {!(isPlanningMode && !canCreateTask) && (
                <Play className="h-3 w-3 mr-1.5" />
              )}
              Start
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={showCreateAttemptConfirmation}
        onOpenChange={setShowCreateAttemptConfirmation}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Attempt?</DialogTitle>
            <DialogDescription>
              Are you sure you want to start a new attempt for this task? This
              will create a new session and branch.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateAttemptConfirmation(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmCreateAttempt}>Start</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CreateAttempt;
