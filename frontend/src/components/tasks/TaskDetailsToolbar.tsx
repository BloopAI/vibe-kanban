import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { attemptsApi, projectsApi } from '@/lib/api';
import type { GitBranch, ProfileVariantLabel } from 'shared/types';
import type { TaskAttempt } from 'shared/types';

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
import { useUserSystem } from '@/components/config-provider';

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

function TaskDetailsToolbar() {
  const { task, projectId } = useContext(TaskDetailsContext);
  const { setLoading } = useContext(TaskAttemptLoadingContext);
  const { selectedAttempt, setSelectedAttempt } = useContext(
    TaskSelectedAttemptContext
  );

  const { isStopping } = useContext(TaskAttemptStoppingContext);
  const location = useLocation();
  const { setAttemptData, isAttemptRunning } = useContext(
    TaskAttemptDataContext
  );

  // UI state using reducer
  const [ui, dispatch] = useReducer(uiReducer, initialUi);

  // Data state
  const [taskAttempts, setTaskAttempts] = useState<TaskAttempt[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] =
    useState<ProfileVariantLabel | null>(null);

  const navigate = useNavigate();
  const { attemptId: urlAttemptId } = useParams<{ attemptId?: string }>();
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
    ui.userForcedCreateMode || taskAttempts.length === 0;

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

  const fetchTaskAttempts = useCallback(async () => {
    if (!task) return;

    try {
      setLoading(true);
      const result = await attemptsApi.getAll(task.id);

      setTaskAttempts((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(result)) return prev;
        return result || prev;
      });

      if (result.length > 0) {
        // Check if we have a new latest attempt (newly created)
        const currentLatest =
          taskAttempts.length > 0
            ? taskAttempts.reduce((latest, current) =>
                new Date(current.created_at) > new Date(latest.created_at)
                  ? current
                  : latest
              )
            : null;

        const newLatest = result.reduce((latest, current) =>
          new Date(current.created_at) > new Date(latest.created_at)
            ? current
            : latest
        );

        // If we have a new attempt that wasn't there before, navigate to it immediately
        const hasNewAttempt =
          newLatest && (!currentLatest || newLatest.id !== currentLatest.id);

        if (hasNewAttempt) {
          // Always navigate to newly created attempts
          handleAttemptSelect(newLatest);
          return;
        }

        // Otherwise, follow existing logic for URL-based attempt selection
        const urlParams = new URLSearchParams(location.search);
        const queryAttemptParam = urlParams.get('attempt');
        const attemptParam = urlAttemptId || queryAttemptParam;

        let selectedAttemptToUse: TaskAttempt;

        if (attemptParam) {
          const specificAttempt = result.find(
            (attempt) => attempt.id === attemptParam
          );
          if (specificAttempt) {
            selectedAttemptToUse = specificAttempt;
          } else {
            selectedAttemptToUse = newLatest;
          }
        } else {
          selectedAttemptToUse = newLatest;
        }

        setSelectedAttempt((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(selectedAttemptToUse))
            return prev;

          // Only navigate if we're not already on the correct attempt URL
          if (
            selectedAttemptToUse &&
            task &&
            (!urlAttemptId || urlAttemptId !== selectedAttemptToUse.id)
          ) {
            const isFullScreen = location.pathname.endsWith('/full');
            const targetUrl = isFullScreen
              ? `/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttemptToUse.id}/full`
              : `/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttemptToUse.id}`;
            navigate(targetUrl, { replace: true });
          }

          return selectedAttemptToUse;
        });
      } else {
        setSelectedAttempt(null);
        setAttemptData({
          processes: [],
          runningProcessDetails: {},
        });
      }
    } catch (error) {
      // we already logged error
    } finally {
      setLoading(false);
    }
  }, [
    task,
    location.search,
    urlAttemptId,
    navigate,
    projectId,
    setLoading,
    setSelectedAttempt,
    setAttemptData,
  ]);

  useEffect(() => {
    fetchTaskAttempts();
  }, [fetchTaskAttempts]);

  // Handle entering create attempt mode
  const handleEnterCreateAttemptMode = useCallback(() => {
    dispatch({ type: 'ENTER_CREATE_MODE' });
  }, []);

  // Handle attempt selection with URL navigation
  const handleAttemptSelect = useCallback(
    (attempt: TaskAttempt | null) => {
      setSelectedAttempt(attempt);
      if (attempt && task) {
        const isFullScreen = location.pathname.endsWith('/full');
        const targetUrl = isFullScreen
          ? `/projects/${projectId}/tasks/${task.id}/attempts/${attempt.id}/full`
          : `/projects/${projectId}/tasks/${task.id}/attempts/${attempt.id}`;
        navigate(targetUrl, { replace: true });
      }
    },
    [navigate, projectId, task, setSelectedAttempt, location.pathname]
  );

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
        dispatch({ type: 'LEAVE_CREATE_MODE' });
      }
    },
    [isInCreateAttemptMode]
  );

  // Wrapper functions for UI state dispatch
  const setError = useCallback(
    (value: string | null | ((prev: string | null) => string | null)) => {
      const errorValue = typeof value === 'function' ? value(ui.error) : value;
      dispatch({ type: 'SET_ERROR', payload: errorValue });
    },
    [ui.error]
  );

  const setShowCreatePRDialog = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const boolValue =
        typeof value === 'function' ? value(ui.showCreatePRDialog) : value;
      dispatch({ type: boolValue ? 'OPEN_CREATE_PR' : 'CLOSE_CREATE_PR' });
    },
    [ui.showCreatePRDialog]
  );

  const setCreatingPR = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const boolValue =
        typeof value === 'function' ? value(ui.creatingPR) : value;
      dispatch({ type: boolValue ? 'CREATE_PR_START' : 'CREATE_PR_DONE' });
    },
    [ui.creatingPR]
  );

  return (
    <>
      <div className="p-4 border-b">
        {/* Error Display */}
        {ui.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-red-600 text-sm">{ui.error}</div>
          </div>
        )}

        {isInCreateAttemptMode ? (
          <CreateAttempt
            fetchTaskAttempts={fetchTaskAttempts}
            createAttemptBranch={createAttemptBranch}
            selectedBranch={selectedBranch}
            selectedProfile={selectedProfile}
            taskAttempts={taskAttempts}
            branches={branches}
            setCreateAttemptBranch={setCreateAttemptBranch}
            setIsInCreateAttemptMode={setIsInCreateAttemptMode}
            setSelectedProfile={setSelectedProfile}
            availableProfiles={profiles}
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
                  creatingPR={ui.creatingPR}
                  handleEnterCreateAttemptMode={handleEnterCreateAttemptMode}
                  handleAttemptSelect={handleAttemptSelect}
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
        creatingPR={ui.creatingPR}
        setShowCreatePRDialog={setShowCreatePRDialog}
        showCreatePRDialog={ui.showCreatePRDialog}
        setCreatingPR={setCreatingPR}
        setError={setError}
        branches={branches}
      />
    </>
  );
}

export default TaskDetailsToolbar;
