import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { projectsApi } from '@/lib/api';
import type {
  GitBranch,
  ProfileVariantLabel,
  TaskAttempt,
  TaskWithAttemptStatus,
} from 'shared/types';

import { useAttemptExecution } from '@/hooks';
import { useTaskStopping } from '@/stores/useTaskDetailsUiStore';

import CreateAttempt from '@/components/tasks/Toolbar/CreateAttempt.tsx';
import CurrentAttempt from '@/components/tasks/Toolbar/CurrentAttempt.tsx';
import { useUserSystem } from '@/components/config-provider';
import { Card } from '../ui/card';

// UI State Management
type UiAction =
  | { type: 'OPEN_CREATE_PR' }
  | { type: 'CLOSE_CREATE_PR' }
  | { type: 'CREATE_PR_START' }
  | { type: 'CREATE_PR_DONE' }
  | { type: 'ENTER_CREATE_MODE' }
  | { type: 'LEAVE_CREATE_MODE' }
  | { type: 'SET_ERROR'; payload: string | null };

interface UiState {
  showCreatePRDialog: boolean;
  creatingPR: boolean;
  userForcedCreateMode: boolean;
  error: string | null;
}

const initialUi: UiState = {
  showCreatePRDialog: false,
  creatingPR: false,
  userForcedCreateMode: false,
  error: null,
};

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'OPEN_CREATE_PR':
      return { ...state, showCreatePRDialog: true };
    case 'CLOSE_CREATE_PR':
      return { ...state, showCreatePRDialog: false };
    case 'CREATE_PR_START':
      return { ...state, creatingPR: true };
    case 'CREATE_PR_DONE':
      return { ...state, creatingPR: false };
    case 'ENTER_CREATE_MODE':
      return { ...state, userForcedCreateMode: true };
    case 'LEAVE_CREATE_MODE':
      return { ...state, userForcedCreateMode: false };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

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

  // UI state using reducer
  const [ui, dispatch] = useReducer(uiReducer, initialUi);

  // Data state
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] =
    useState<ProfileVariantLabel | null>(null);
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
    forceCreateAttempt ??
    (ui.userForcedCreateMode || taskAttempts.length === 0);

  // Derive createAttemptBranch for backward compatibility
  const createAttemptBranch = useMemo(() => {
    if (selectedBranch) {
      return selectedBranch;
    } else if (
      latestAttempt?.base_branch &&
      branches.some((b: GitBranch) => b.name === latestAttempt.base_branch)
    ) {
      return latestAttempt.base_branch;
    }
    return selectedBranch;
  }, [latestAttempt, branches, selectedBranch]);

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
    if (system.config?.profile) {
      setSelectedProfile(system.config.profile);
    }
  }, [system.config?.profile]);

  // Simplified - hooks handle data fetching and navigation
  // const fetchTaskAttempts = useCallback(() => {
  //   // The useSelectedAttempt hook handles all this logic now
  // }, []);

  // Remove fetchTaskAttempts - hooks handle this now

  // Handle entering create attempt mode
  const handleEnterCreateAttemptMode = useCallback(() => {
    dispatch({ type: 'ENTER_CREATE_MODE' });
  }, []);

  // Stub handlers for backward compatibility with CreateAttempt
  const setCreateAttemptBranch = useCallback(
    (branch: string | null | ((prev: string | null) => string | null)) => {
      if (typeof branch === 'function') {
        setSelectedBranch((prev) => branch(prev));
      } else {
        setSelectedBranch(branch);
      }
      // This is now derived state, so no-op
    },
    []
  );

  const setIsInCreateAttemptMode = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const boolValue =
        typeof value === 'function' ? value(isInCreateAttemptMode) : value;
      if (boolValue) {
        dispatch({ type: 'ENTER_CREATE_MODE' });
      } else {
        if (onLeaveForceCreateAttempt) onLeaveForceCreateAttempt();
        dispatch({ type: 'LEAVE_CREATE_MODE' });
      }
    },
    [isInCreateAttemptMode, onLeaveForceCreateAttempt]
  );

  // Wrapper functions for UI state dispatch
  const setError = useCallback(
    (value: string | null | ((prev: string | null) => string | null)) => {
      const errorValue = typeof value === 'function' ? value(ui.error) : value;
      dispatch({ type: 'SET_ERROR', payload: errorValue });
    },
    [ui.error]
  );

  return (
    <>
      <div>
        {/* Error Display */}
        {ui.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200">
            <div className="text-destructive text-sm">{ui.error}</div>
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
            setCreateAttemptBranch={setCreateAttemptBranch}
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
                    selectedBranch={selectedBranch}
                    setError={setError}
                    creatingPR={ui.creatingPR}
                    handleEnterCreateAttemptMode={handleEnterCreateAttemptMode}
                    branches={branches}
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
      </div>
    </>
  );
}

export default TaskDetailsToolbar;
