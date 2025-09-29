import { Dispatch, SetStateAction, useCallback } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { X } from 'lucide-react';
import type { GitBranch, Task } from 'shared/types';
import type { ExecutorConfig } from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';
import type { TaskAttempt } from 'shared/types';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import BranchSelector from '@/components/tasks/BranchSelector.tsx';
import { ExecutorProfileSelector } from '@/components/settings';

import { showModal } from '@/lib/modals';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

type Props = {
  task: Task;
  branches: GitBranch[];
  taskAttempts: TaskAttempt[];
  createAttemptBranch: string | null;
  selectedProfile: ExecutorProfileId | null;
  selectedBranch: string | null;
  setIsInCreateAttemptMode: Dispatch<SetStateAction<boolean>>;
  setCreateAttemptBranch: (branch: string | null) => void;
  setSelectedProfile: Dispatch<SetStateAction<ExecutorProfileId | null>>;
  availableProfiles: Record<string, ExecutorConfig> | null;
  selectedAttempt: TaskAttempt | null;
};

function CreateAttempt({
  task,
  branches,
  taskAttempts,
  createAttemptBranch,
  selectedProfile,
  selectedBranch,
  setIsInCreateAttemptMode,
  setCreateAttemptBranch,
  setSelectedProfile,
  availableProfiles,
  selectedAttempt,
}: Props) {
  const { isAttemptRunning } = useAttemptExecution(selectedAttempt?.id);
  const { createAttempt, isCreating } = useAttemptCreation(task.id);

  // Create attempt logic
  const actuallyCreateAttempt = useCallback(
    async (profile: ExecutorProfileId, baseBranch?: string) => {
      const effectiveBaseBranch = baseBranch || selectedBranch;

      if (!effectiveBaseBranch) {
        throw new Error('Base branch is required to create an attempt');
      }

      await createAttempt({
        profile,
        baseBranch: effectiveBaseBranch,
      });
    },
    [createAttempt, selectedBranch]
  );

  // Handler for Enter key or Start button
  const onCreateNewAttempt = useCallback(
    async (
      profile: ExecutorProfileId,
      baseBranch?: string,
      isKeyTriggered?: boolean
    ) => {
      if (task.status === 'todo' && isKeyTriggered) {
        try {
          const result = await showModal<'confirmed' | 'canceled'>(
            'create-attempt-confirm',
            {
              title: 'Start New Attempt?',
              message:
                'Are you sure you want to start a new attempt for this task? This will create a new session and branch.',
            }
          );

          if (result === 'confirmed') {
            await actuallyCreateAttempt(profile, baseBranch);
            setIsInCreateAttemptMode(false);
          }
        } catch (error) {
          // User cancelled - do nothing
        }
      } else {
        await actuallyCreateAttempt(profile, baseBranch);
        setIsInCreateAttemptMode(false);
      }
    },
    [task.status, actuallyCreateAttempt, setIsInCreateAttemptMode]
  );

  const handleExitCreateAttemptMode = () => {
    setIsInCreateAttemptMode(false);
  };

  const handleCreateAttempt = () => {
    if (!selectedProfile) {
      return;
    }
    onCreateNewAttempt(selectedProfile, createAttemptBranch || undefined);
  };

  return (
    <div className="">
      <Card className="bg-background p-3 text-sm border-y border-dashed">
        Create Attempt
      </Card>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between">
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
        <div className="flex items-center">
          <label className="text-xs font-medium text-muted-foreground">
            Each time you start an attempt, a new session is initiated with your
            selected coding agent, and a git worktree and corresponding task
            branch are created.
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          {/* Top Row: Executor Profile and Variant (spans 2 columns) */}
          {availableProfiles && (
            <div className="col-span-1 sm:col-span-2">
              <ExecutorProfileSelector
                profiles={availableProfiles}
                selectedProfile={selectedProfile}
                onProfileSelect={setSelectedProfile}
                showLabel={true}
              />
            </div>
          )}

          {/* Bottom Row: Base Branch and Start Button */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">
              Base branch <span className="text-destructive">*</span>
            </Label>
            <BranchSelector
              branches={branches}
              selectedBranch={createAttemptBranch}
              onBranchSelect={setCreateAttemptBranch}
              placeholder="Select branch"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-medium opacity-0">Start</Label>
            <Button
              onClick={handleCreateAttempt}
              disabled={
                !selectedProfile ||
                !createAttemptBranch ||
                isAttemptRunning ||
                isCreating
              }
              size="sm"
              className="w-full text-xs gap-2 justify-center bg-black text-white hover:bg-black/90"
              title={
                !createAttemptBranch
                  ? 'Base branch is required'
                  : !selectedProfile
                    ? 'Coding agent is required'
                    : undefined
              }
            >
              {isCreating ? 'Creating...' : 'Start'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateAttempt;
