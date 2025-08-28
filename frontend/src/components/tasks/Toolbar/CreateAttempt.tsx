import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ArrowDown, Settings2, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import type {
  ProfileConfig,
  GitBranch,
  ProfileVariantLabel,
  Task,
} from 'shared/types';
import type { TaskAttempt } from 'shared/types';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
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
import { Card } from '@/components/ui/card';

type Props = {
  task: Task;
  branches: GitBranch[];
  taskAttempts: TaskAttempt[];
  createAttemptBranch: string | null;
  selectedProfile: ProfileVariantLabel | null;
  selectedBranch: string | null;
  setIsInCreateAttemptMode: Dispatch<SetStateAction<boolean>>;
  setCreateAttemptBranch: Dispatch<SetStateAction<string | null>>;
  setSelectedProfile: Dispatch<SetStateAction<ProfileVariantLabel | null>>;
  availableProfiles: ProfileConfig[] | null;
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

  const [showCreateAttemptConfirmation, setShowCreateAttemptConfirmation] =
    useState(false);

  const [pendingBaseBranch, setPendingBaseBranch] = useState<
    string | undefined
  >(undefined);

  // Create attempt logic
  const actuallyCreateAttempt = useCallback(
    async (profile: ProfileVariantLabel, baseBranch?: string) => {
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
    (
      profile: ProfileVariantLabel,
      baseBranch?: string,
      isKeyTriggered?: boolean
    ) => {
      if (task.status === 'todo' && isKeyTriggered) {
        setSelectedProfile(profile);
        setPendingBaseBranch(baseBranch);
        setShowCreateAttemptConfirmation(true);
      } else {
        actuallyCreateAttempt(profile, baseBranch);
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
        if (!selectedProfile) {
          return;
        }
        onCreateNewAttempt(
          selectedProfile,
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
    if (!selectedProfile) {
      return;
    }
    onCreateNewAttempt(selectedProfile, createAttemptBranch || undefined);
  };

  const handleConfirmCreateAttempt = () => {
    if (!selectedProfile) {
      return;
    }
    actuallyCreateAttempt(selectedProfile, pendingBaseBranch);
    setShowCreateAttemptConfirmation(false);
    setIsInCreateAttemptMode(false);
  };

  return (
    <div className="">
      <Card className="bg-background p-3 text-sm border-y border-dashed">
        Create Attempt
      </Card>
      <div className="space-y-3 px-3">
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
          {/* Step 1: Choose Base Branch */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Base branch <span className="text-destructive">*</span>
              </label>
            </div>
            <BranchSelector
              branches={branches}
              selectedBranch={createAttemptBranch}
              onBranchSelect={setCreateAttemptBranch}
              placeholder="Select branch"
            />
          </div>

          {/* Step 2: Choose Profile */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Profile
              </label>
            </div>
            {availableProfiles && (
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
                        {selectedProfile?.profile || 'Select profile'}
                      </span>
                    </div>
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full">
                  {availableProfiles.map((profile) => (
                    <DropdownMenuItem
                      key={profile.label}
                      onClick={() => {
                        setSelectedProfile({
                          profile: profile.label,
                          variant: null,
                        });
                      }}
                      className={
                        selectedProfile?.profile === profile.label
                          ? 'bg-accent'
                          : ''
                      }
                    >
                      {profile.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Step 3: Choose Variant (if available) */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Variant
              </label>
            </div>
            {(() => {
              const currentProfile = availableProfiles?.find(
                (p) => p.label === selectedProfile?.profile
              );
              const hasVariants =
                currentProfile?.variants && currentProfile.variants.length > 0;

              if (hasVariants && currentProfile) {
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full px-2 flex items-center justify-between text-xs"
                      >
                        <span className="truncate flex-1 text-left">
                          {selectedProfile?.variant || 'Default'}
                        </span>
                        <ArrowDown className="h-3 w-3 ml-1 flex-shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-full">
                      <DropdownMenuItem
                        onClick={() => {
                          if (selectedProfile) {
                            setSelectedProfile({
                              ...selectedProfile,
                              variant: null,
                            });
                          }
                        }}
                        className={!selectedProfile?.variant ? 'bg-accent' : ''}
                      >
                        Default
                      </DropdownMenuItem>
                      {currentProfile.variants.map((variant) => (
                        <DropdownMenuItem
                          key={variant.label}
                          onClick={() => {
                            if (selectedProfile) {
                              setSelectedProfile({
                                ...selectedProfile,
                                variant: variant.label,
                              });
                            }
                          }}
                          className={
                            selectedProfile?.variant === variant.label
                              ? 'bg-accent'
                              : ''
                          }
                        >
                          {variant.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }
              if (currentProfile) {
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="w-full text-xs justify-start"
                  >
                    Default
                  </Button>
                );
              }
              return (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="w-full text-xs justify-start"
                >
                  Select profile first
                </Button>
              );
            })()}
          </div>

          {/* Step 4: Start Attempt */}
          <div className="space-y-1">
            <Button
              onClick={handleCreateAttempt}
              disabled={
                !selectedProfile ||
                !createAttemptBranch ||
                isAttemptRunning ||
                isCreating
              }
              size="sm"
              className={
                'w-full text-xs gap-2 justify-center bg-black text-white hover:bg-black/90'
              }
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
            <Button
              onClick={handleConfirmCreateAttempt}
              disabled={isCreating}
              className="bg-black text-white hover:bg-black/90"
            >
              {isCreating ? 'Creating...' : 'Start'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CreateAttempt;
