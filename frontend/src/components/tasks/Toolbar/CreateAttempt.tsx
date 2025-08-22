import { Dispatch, SetStateAction, useCallback, useContext } from 'react';
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
} from 'shared/types';
import type { TaskAttempt } from 'shared/types';
import { attemptsApi } from '@/lib/api.ts';
import {
  TaskAttemptDataContext,
  TaskDetailsContext,
} from '@/components/context/taskDetailsContext.ts';
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
  createAttemptBranch: string | null;
  selectedProfile: ProfileVariantLabel | null;
  selectedBranch: string | null;
  fetchTaskAttempts: () => void;
  setIsInCreateAttemptMode: Dispatch<SetStateAction<boolean>>;
  setCreateAttemptBranch: Dispatch<SetStateAction<string | null>>;
  setSelectedProfile: Dispatch<SetStateAction<ProfileVariantLabel | null>>;
  availableProfiles: ProfileConfig[] | null;
};

function CreateAttempt({
  branches,
  taskAttempts,
  createAttemptBranch,
  selectedProfile,
  selectedBranch,
  fetchTaskAttempts,
  setIsInCreateAttemptMode,
  setCreateAttemptBranch,
  setSelectedProfile,
  availableProfiles,
}: Props) {
  const { task } = useContext(TaskDetailsContext);
  const { isAttemptRunning } = useContext(TaskAttemptDataContext);

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

      await attemptsApi.create({
        task_id: task.id,
        profile_variant_label: profile,
        base_branch: effectiveBaseBranch,
      });
      fetchTaskAttempts();
    },
    [task.id, selectedProfile, selectedBranch, fetchTaskAttempts]
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
                Base branch <span className="text-red-500">*</span>
              </label>
            </div>
            <BranchSelector
              branches={branches}
              selectedBranch={createAttemptBranch}
              onBranchSelect={setCreateAttemptBranch}
              placeholder="Select branch"
            />
          </div>

          {/* Step 2: Choose Profile and Mode */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Profile
              </label>
            </div>
            <div className="flex gap-2">
              {availableProfiles && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 justify-between text-xs"
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

              {/* Show variant dropdown or disabled button */}
              {(() => {
                const currentProfile = availableProfiles?.find(
                  (p) => p.label === selectedProfile?.profile
                );
                const hasVariants =
                  currentProfile?.variants &&
                  currentProfile.variants.length > 0;

                if (hasVariants) {
                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-24 px-2 flex items-center justify-between text-xs"
                        >
                          <span className="truncate flex-1 text-left">
                            {selectedProfile?.variant || 'Default'}
                          </span>
                          <ArrowDown className="h-3 w-3 ml-1 flex-shrink-0" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => {
                            if (selectedProfile) {
                              setSelectedProfile({
                                ...selectedProfile,
                                variant: null,
                              });
                            }
                          }}
                          className={
                            !selectedProfile?.variant ? 'bg-accent' : ''
                          }
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
                } else if (currentProfile) {
                  // Show disabled button when profile exists but has no variants
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-24 px-2 flex items-center justify-between text-xs"
                      disabled
                    >
                      <span className="truncate flex-1 text-left">Default</span>
                    </Button>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* Step 3: Start Attempt */}
          <div className="space-y-1">
            <Button
              onClick={handleCreateAttempt}
              disabled={
                !selectedProfile || !createAttemptBranch || isAttemptRunning
              }
              size="sm"
              className={'w-full text-xs gap-2'}
              title={
                !createAttemptBranch
                  ? 'Base branch is required'
                  : !selectedProfile
                    ? 'Coding agent is required'
                    : undefined
              }
            >
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
