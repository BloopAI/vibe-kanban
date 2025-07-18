import { useCallback, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfig } from '@/components/config-provider';
import { attemptsApi, projectsApi } from '@/lib/api';
import type { GitBranch, TaskAttempt } from 'shared/types';
import { EXECUTOR_LABELS, EXECUTOR_TYPES } from 'shared/types';
import {
  TaskAttemptDataContext,
  TaskAttemptLoadingContext,
  TaskAttemptStoppingContext,
  TaskDetailsContext,
  TaskSelectedAttemptContext,
} from '@/components/context/taskDetailsContext.ts';
import CreatePRDialog from '@/components/tasks/Toolbar/CreatePRDialog.tsx';
import CreateAttempt from '@/components/tasks/Toolbar/CreateAttempt.tsx';
import CurrentAttempt from '@/components/tasks/Toolbar/CurrentAttempt.tsx';

const availableExecutors = EXECUTOR_TYPES.map((id) => ({
  id,
  name: EXECUTOR_LABELS[id] || id,
}));

function TaskDetailsToolbar() {
  const { task, projectId } = useContext(TaskDetailsContext);
  const { setLoading } = useContext(TaskAttemptLoadingContext);
  const { selectedAttempt, setSelectedAttempt } = useContext(
    TaskSelectedAttemptContext
  );

  const { isStopping } = useContext(TaskAttemptStoppingContext);
  const { setAttemptData, isAttemptRunning } = useContext(
    TaskAttemptDataContext
  );

  const [taskAttempts, setTaskAttempts] = useState<TaskAttempt[]>([]);
  const location = useLocation();

  const { config } = useConfig();

  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  const [selectedExecutor, setSelectedExecutor] = useState<string>(
    config?.executor.type || 'claude'
  );

  // State for create attempt mode
  const [isInCreateAttemptMode, setIsInCreateAttemptMode] = useState(false);
  const [createAttemptBranch, setCreateAttemptBranch] = useState<string | null>(
    selectedBranch
  );
  const [createAttemptExecutor, setCreateAttemptExecutor] =
    useState<string>(selectedExecutor);

  // Branch status and git operations state
  const [creatingPR, setCreatingPR] = useState(false);
  const [showCreatePRDialog, setShowCreatePRDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjectBranches = useCallback(async () => {
    const result = await projectsApi.getBranches(projectId);

    setBranches(result);
    // Set current branch as default
    const currentBranch = result.find((b) => b.is_current);
    if (currentBranch) {
      setSelectedBranch((prev) => (!prev ? currentBranch.name : prev));
    }
  }, [projectId]);

  useEffect(() => {
    fetchProjectBranches();
  }, [fetchProjectBranches]);

  // Set default executor from config
  useEffect(() => {
    if (config && config.executor.type !== selectedExecutor) {
      setSelectedExecutor(config.executor.type);
    }
  }, [config, selectedExecutor]);

  // Set create attempt mode when there are no attempts
  useEffect(() => {
    setIsInCreateAttemptMode(taskAttempts.length === 0);
  }, [taskAttempts.length]);

  // Update default values from latest attempt when taskAttempts change
  useEffect(() => {
    if (taskAttempts.length > 0) {
      const latestAttempt = taskAttempts.reduce((latest, current) =>
        new Date(current.created_at) > new Date(latest.created_at)
          ? current
          : latest
      );

      // Only update if branch still exists in available branches
      if (
        latestAttempt.base_branch &&
        branches.some((b: GitBranch) => b.name === latestAttempt.base_branch)
      ) {
        setCreateAttemptBranch(latestAttempt.base_branch);
      }

      // Only update executor if it's different from default and exists in available executors
      if (
        latestAttempt.executor &&
        availableExecutors.some((e) => e.id === latestAttempt.executor)
      ) {
        setCreateAttemptExecutor(latestAttempt.executor);
      }
    }
  }, [taskAttempts, branches, availableExecutors]);

  const fetchTaskAttempts = useCallback(async () => {
    if (!task) return;

    try {
      setLoading(true);
      const result = await attemptsApi.getAll(projectId, task.id);

      setTaskAttempts((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(result)) return prev;
        return result || prev;
      });

      if (result.length > 0) {
        // Check if there's an attempt query parameter
        const urlParams = new URLSearchParams(location.search);
        const attemptParam = urlParams.get('attempt');

        let selectedAttemptToUse: TaskAttempt;

        if (attemptParam) {
          // Try to find the specific attempt
          const specificAttempt = result.find(
            (attempt) => attempt.id === attemptParam
          );
          if (specificAttempt) {
            selectedAttemptToUse = specificAttempt;
          } else {
            // Fall back to latest if specific attempt not found
            selectedAttemptToUse = result.reduce((latest, current) =>
              new Date(current.created_at) > new Date(latest.created_at)
                ? current
                : latest
            );
          }
        } else {
          // Use latest attempt if no specific attempt requested
          selectedAttemptToUse = result.reduce((latest, current) =>
            new Date(current.created_at) > new Date(latest.created_at)
              ? current
              : latest
          );
        }

        setSelectedAttempt((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(selectedAttemptToUse))
            return prev;
          return selectedAttemptToUse;
        });
      } else {
        setSelectedAttempt(null);
        setAttemptData({
          processes: [],
          runningProcessDetails: {},
          allLogs: [],
        });
      }
    } catch (error) {
      // we already logged error
    } finally {
      setLoading(false);
    }
  }, [task, projectId, location.search]);

  useEffect(() => {
    fetchTaskAttempts();
  }, [fetchTaskAttempts]);

  // Handle entering create attempt mode
  const handleEnterCreateAttemptMode = useCallback(() => {
    setIsInCreateAttemptMode(true);

    // Use latest attempt's settings as defaults if available
    if (taskAttempts.length > 0) {
      const latestAttempt = taskAttempts.reduce((latest, current) =>
        new Date(current.created_at) > new Date(latest.created_at)
          ? current
          : latest
      );

      // Use latest attempt's branch if it still exists, otherwise use current selected branch
      if (
        latestAttempt.base_branch &&
        branches.some((b: GitBranch) => b.name === latestAttempt.base_branch)
      ) {
        setCreateAttemptBranch(latestAttempt.base_branch);
      } else {
        setCreateAttemptBranch(selectedBranch);
      }

      // Use latest attempt's executor if it exists, otherwise use current selected executor
      if (
        latestAttempt.executor &&
        availableExecutors.some((e) => e.id === latestAttempt.executor)
      ) {
        setCreateAttemptExecutor(latestAttempt.executor);
      } else {
        setCreateAttemptExecutor(selectedExecutor);
      }
    } else {
      // Fallback to current selected values if no attempts exist
      setCreateAttemptBranch(selectedBranch);
      setCreateAttemptExecutor(selectedExecutor);
    }
  }, [taskAttempts, branches, selectedBranch, selectedExecutor]);

  return (
    <>
      <div className="px-6 pb-4 border-b">
        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-red-600 text-sm">{error}</div>
          </div>
        )}

        {isInCreateAttemptMode ? (
          <CreateAttempt
            fetchTaskAttempts={fetchTaskAttempts}
            createAttemptBranch={createAttemptBranch}
            selectedBranch={selectedBranch}
            createAttemptExecutor={createAttemptExecutor}
            selectedExecutor={selectedExecutor}
            taskAttempts={taskAttempts}
            branches={branches}
            setCreateAttemptBranch={setCreateAttemptBranch}
            setIsInCreateAttemptMode={setIsInCreateAttemptMode}
            setCreateAttemptExecutor={setCreateAttemptExecutor}
            availableExecutors={availableExecutors}
          />
        ) : (
          <div className="space-y-3 p-3 bg-muted/20 rounded-lg border">
            {/* Current Attempt Info */}
            <div className="space-y-2">
              {selectedAttempt ? (
                <CurrentAttempt
                  selectedAttempt={selectedAttempt}
                  taskAttempts={taskAttempts}
                  selectedBranch={selectedBranch}
                  setError={setError}
                  setShowCreatePRDialog={setShowCreatePRDialog}
                  creatingPR={creatingPR}
                  handleEnterCreateAttemptMode={handleEnterCreateAttemptMode}
                  availableExecutors={availableExecutors}
                  branches={branches}
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

            {/* Special Actions */}
            {!selectedAttempt && !isAttemptRunning && !isStopping && (
              <div className="space-y-2 pt-3 border-t">
                <Button
                  onClick={handleEnterCreateAttemptMode}
                  size="sm"
                  className="w-full gap-2"
                >
                  <Play className="h-4 w-4" />
                  Start Attempt
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <CreatePRDialog
        creatingPR={creatingPR}
        setShowCreatePRDialog={setShowCreatePRDialog}
        showCreatePRDialog={showCreatePRDialog}
        setCreatingPR={setCreatingPR}
        setError={setError}
        branches={branches}
      />
    </>
  );
}

export default TaskDetailsToolbar;
