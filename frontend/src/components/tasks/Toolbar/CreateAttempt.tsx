import { Dispatch, SetStateAction, useContext } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ArrowDown, Play, Settings2, X } from 'lucide-react';
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
import { useConfig } from '@/components/config-provider.tsx';
import BranchSelector from '@/components/tasks/BranchSelector.tsx';

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
  const { config } = useConfig();

  const onCreateNewAttempt = async (executor?: string, baseBranch?: string) => {
    try {
      await attemptsApi.create(projectId!, task.id, {
        executor: executor || selectedExecutor,
        base_branch: baseBranch || selectedBranch,
      });
      fetchTaskAttempts();
    } catch (error) {
      // Optionally handle error
    }
  };

  const handleExitCreateAttemptMode = () => {
    setIsInCreateAttemptMode(false);
  };

  const handleCreateAttempt = () => {
    onCreateNewAttempt(createAttemptExecutor, createAttemptBranch || undefined);
    handleExitCreateAttemptMode();
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
              disabled={!createAttemptExecutor || isAttemptRunning}
              size="sm"
              className="w-full text-xs"
            >
              <Play className="h-3 w-3 mr-1.5" />
              Start
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateAttempt;
