import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { projectsApi, attemptsApi } from '@/lib/api';
import type {
  GitBranch,
  TaskAttempt,
  TaskWithAttemptStatus,
} from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';

import { useAttemptExecution, useBranchStatus } from '@/hooks';
import { useTaskStopping } from '@/stores/useTaskDetailsUiStore';

import CreateAttempt from '@/components/tasks/Toolbar/CreateAttempt.tsx';
import CurrentAttempt from '@/components/tasks/Toolbar/CurrentAttempt.tsx';
import GitOperations from '@/components/tasks/Toolbar/GitOperations.tsx';
import { useUserSystem } from '@/components/config-provider';
import { Card } from '../ui/card';

function TaskDetailsToolbar({
  task,
  projectId,
  projectHasDevScript,
  forceCreateAttempt,
  onLeaveForceCreateAttempt,
  attempts,
  selectedAttempt,
  setSelectedAttempt,
}: {
  task: TaskWithAttemptStatus;
  projectId: string;
  projectHasDevScript?: boolean;
  forceCreateAttempt?: boolean;
  onLeaveForceCreateAttempt?: () => void;
  attempts: TaskAttempt[];
  selectedAttempt: TaskAttempt | null;
  setSelectedAttempt: (attempt: TaskAttempt | null) => void;
}) {
  // Use props instead of context
  const taskAttempts = attempts;
  // const { setLoading } = useTaskLoading(task.id);
  const { isStopping } = useTaskStopping(task.id);
  const { isAttemptRunning } = useAttemptExecution(selectedAttempt?.id);
  const { data: branchStatus } = useBranchStatus(selectedAttempt?.id);

  // UI state
  const [userForcedCreateMode, setUserForcedCreateMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] =
    useState<ExecutorProfileId | null>(null);
  const [parentBaseBranch, setParentBaseBranch] = useState<string | null>(null);
  // const { attemptId: urlAttemptId } = useParams<{ attemptId?: string }>();
  const { system, profiles } = useUserSystem();

  // Memoize latest attempt calculation
  const latestAttempt = useMemo(() => {
    if (taskAttempts.length === 0) return null;
    return taskAttempts.reduce((latest, current) =>
      new Date(current.created_at) > new Date(latest.created_at)
        ? current
        : latest
    );
  }, [taskAttempts]);

  // Derived state
  const isInCreateAttemptMode =
    forceCreateAttempt ?? (userForcedCreateMode || taskAttempts.length === 0);

  // Derive createAttemptBranch for backward compatibility
  const createAttemptBranch = useMemo(() => {
    // Priority order:
    // 1. User explicitly selected a branch
    if (selectedBranch) {
      return selectedBranch;
    }

    // 2. Latest attempt's base branch (existing behavior for resume/rerun)
    if (
      latestAttempt?.target_branch &&
      branches.some((b: GitBranch) => b.name === latestAttempt.target_branch)
    ) {
      return latestAttempt.target_branch;
    }

    // 3. Parent task attempt's base branch (NEW - for inherited tasks)
    if (parentBaseBranch) {
      return parentBaseBranch;
    }

    // 4. Fall back to current branch
    const currentBranch = branches.find((b) => b.is_current);
    return currentBranch?.name || null;
  }, [latestAttempt, branches, selectedBranch, parentBaseBranch]);

  const fetchProjectBranches = useCallback(async () => {
    const result = await projectsApi.getBranches(projectId);

    setBranches(result);
  }, [projectId]);

  useEffect(() => {
    fetchProjectBranches();
  }, [fetchProjectBranches]);

  // Set default executor from config
  useEffect(() => {
    if (system.config?.executor_profile) {
      setSelectedProfile(system.config.executor_profile);
    }
  }, [system.config?.executor_profile]);

  // Fetch parent task attempt's base branch
  useEffect(() => {
    if (task.parent_task_attempt) {
      attemptsApi
        .get(task.parent_task_attempt)
        .then((attempt) => setParentBaseBranch(attempt.branch))
        .catch(() => setParentBaseBranch(null));
    } else {
      setParentBaseBranch(null);
    }
  }, [task.parent_task_attempt]);

  // Simplified - hooks handle data fetching and navigation
  // const fetchTaskAttempts = useCallback(() => {
  //   // The useSelectedAttempt hook handles all this logic now
  // }, []);

  // Remove fetchTaskAttempts - hooks handle this now

  // Handle entering create attempt mode
  const handleEnterCreateAttemptMode = useCallback(() => {
    setUserForcedCreateMode(true);
  }, []);

  const setIsInCreateAttemptMode = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const boolValue =
        typeof value === 'function' ? value(isInCreateAttemptMode) : value;
      if (boolValue) {
        setUserForcedCreateMode(true);
      } else {
        if (onLeaveForceCreateAttempt) onLeaveForceCreateAttempt();
        setUserForcedCreateMode(false);
      }
    },
    [isInCreateAttemptMode, onLeaveForceCreateAttempt]
  );

  return (
    <>
      <div>
        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200">
            <div className="text-destructive text-sm">{error}</div>
          </div>
        )}

        {isInCreateAttemptMode ? (
          <CreateAttempt
            task={task}
            createAttemptBranch={createAttemptBranch}
            selectedBranch={selectedBranch}
            selectedProfile={selectedProfile}
            taskAttempts={taskAttempts}
            branches={branches}
            setCreateAttemptBranch={setSelectedBranch}
            setIsInCreateAttemptMode={setIsInCreateAttemptMode}
            setSelectedProfile={setSelectedProfile}
            availableProfiles={profiles}
            selectedAttempt={selectedAttempt}
          />
        ) : (
          <div className="">
            <Card className="bg-background border-y border-dashed p-3 text-sm">
              Actions
            </Card>
            <div className="p-3">
              {/* Current Attempt Info */}
              <div className="space-y-2">
                {selectedAttempt ? (
                  <CurrentAttempt
                    task={task}
                    projectId={projectId}
                    projectHasDevScript={projectHasDevScript ?? false}
                    selectedAttempt={selectedAttempt}
                    taskAttempts={taskAttempts}
                    handleEnterCreateAttemptMode={handleEnterCreateAttemptMode}
                    setSelectedAttempt={setSelectedAttempt}
                  />
                ) : (
                  <div className="text-center py-8">
                    <div className="text-lg font-medium text-muted-foreground">
                      No attempts yet
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Start your first attempt to begin working on this task
                    </div>
                  </div>
                )}
              </div>

              {/* Special Actions: show only in sidebar (non-fullscreen) */}
              {!selectedAttempt && !isAttemptRunning && !isStopping && (
                <div className="space-y-2 pt-3 border-t">
                  <Button
                    onClick={handleEnterCreateAttemptMode}
                    size="sm"
                    className="w-full gap-2 bg-black text-white hover:bg-black/90"
                  >
                    <Play className="h-4 w-4" />
                    Start Attempt
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Independent Git Operations Section */}
        {selectedAttempt && branchStatus && (
          <GitOperations
            selectedAttempt={selectedAttempt}
            task={task}
            projectId={projectId}
            branchStatus={branchStatus}
            branches={branches}
            isAttemptRunning={isAttemptRunning}
            setError={setError}
            selectedBranch={selectedBranch}
          />
        )}
      </div>
    </>
  );
}

export default TaskDetailsToolbar;
