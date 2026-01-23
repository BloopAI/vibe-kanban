import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  DraftWorkspaceData,
  ExecutorProfileId,
  Repo,
  RepoWithTargetBranch,
} from 'shared/types';
import { ScratchType } from 'shared/types';
import { useScratch } from '@/hooks/useScratch';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useProjects } from '@/hooks/useProjects';
import { useUserSystem } from '@/components/ConfigProvider';
import { projectsApi, repoApi } from '@/lib/api';

// ============================================================================
// Types
// ============================================================================

interface LocationState {
  initialPrompt?: string | null;
  preferredRepos?: Array<{
    repo_id: string;
    target_branch: string | null;
  }> | null;
  project_id?: string | null;
}

/** Unified repo model - keeps repo and branch together */
interface SelectedRepo {
  repo: Repo;
  targetBranch: string | null;
}

type Phase = 'loading' | 'ready' | 'error';

interface DraftState {
  phase: Phase;
  error: string | null;
  projectId: string | null;
  repos: SelectedRepo[];
  profile: ExecutorProfileId | null;
  message: string;
}

type DraftAction =
  | {
      type: 'INIT_COMPLETE';
      data: Partial<Omit<DraftState, 'phase' | 'error'>>;
    }
  | { type: 'INIT_ERROR'; error: string }
  | { type: 'SET_PROJECT'; projectId: string | null }
  | { type: 'ADD_REPO'; repo: Repo; targetBranch: string | null }
  | { type: 'REMOVE_REPO'; repoId: string }
  | { type: 'SET_TARGET_BRANCH'; repoId: string; branch: string }
  | { type: 'SET_PROFILE'; profile: ExecutorProfileId | null }
  | { type: 'SET_MESSAGE'; message: string }
  | { type: 'CLEAR_REPOS' }
  | { type: 'CLEAR' };

// ============================================================================
// Reducer
// ============================================================================

const initialState: DraftState = {
  phase: 'loading',
  error: null,
  projectId: null,
  repos: [],
  profile: null,
  message: '',
};

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'INIT_COMPLETE':
      return {
        ...state,
        phase: 'ready',
        error: null,
        ...action.data,
      };

    case 'INIT_ERROR':
      return {
        ...state,
        phase: 'error',
        error: action.error,
      };

    case 'SET_PROJECT':
      return { ...state, projectId: action.projectId };

    case 'ADD_REPO': {
      // Don't add duplicate repos
      if (state.repos.some((r) => r.repo.id === action.repo.id)) {
        return state;
      }
      return {
        ...state,
        repos: [
          ...state.repos,
          { repo: action.repo, targetBranch: action.targetBranch },
        ],
      };
    }

    case 'REMOVE_REPO':
      return {
        ...state,
        repos: state.repos.filter((r) => r.repo.id !== action.repoId),
      };

    case 'SET_TARGET_BRANCH':
      return {
        ...state,
        repos: state.repos.map((r) =>
          r.repo.id === action.repoId
            ? { ...r, targetBranch: action.branch }
            : r
        ),
      };

    case 'SET_PROFILE':
      return { ...state, profile: action.profile };

    case 'SET_MESSAGE':
      return { ...state, message: action.message };

    case 'CLEAR_REPOS':
      return { ...state, repos: [] };

    case 'CLEAR':
      return { ...initialState, phase: 'ready' };

    default:
      return state;
  }
}

// ============================================================================
// Constants
// ============================================================================

const DRAFT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

// ============================================================================
// Hook
// ============================================================================

interface UseCreateModeStateParams {
  initialProjectId?: string;
  initialRepos?: RepoWithTargetBranch[];
}

interface UseCreateModeStateResult {
  // State
  selectedProjectId: string | null;
  repos: Repo[];
  targetBranches: Record<string, string | null>;
  selectedProfile: ExecutorProfileId | null;
  message: string;
  isLoading: boolean;
  hasInitialValue: boolean;

  // Actions
  setSelectedProjectId: (id: string | null) => void;
  setMessage: (message: string) => void;
  setSelectedProfile: (profile: ExecutorProfileId | null) => void;
  addRepo: (repo: Repo) => void;
  removeRepo: (repoId: string) => void;
  clearRepos: () => void;
  setTargetBranch: (repoId: string, branch: string) => void;
  clearDraft: () => Promise<void>;
}

export function useCreateModeState({
  initialProjectId,
  initialRepos,
}: UseCreateModeStateParams): UseCreateModeStateResult {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectsById, isLoading: projectsLoading } = useProjects();
  const { profiles } = useUserSystem();

  const {
    scratch,
    updateScratch,
    deleteScratch,
    isLoading: scratchLoading,
  } = useScratch(ScratchType.DRAFT_WORKSPACE, DRAFT_WORKSPACE_ID);

  const [state, dispatch] = useReducer(draftReducer, initialState);

  // Capture navigation state once on mount
  const navStateRef = useRef<LocationState | null>(
    location.state as LocationState | null
  );
  const hasInitialized = useRef(false);

  // Profile validator
  const isValidProfile = useCallback(
    (profile: ExecutorProfileId | null): boolean => {
      if (!profile || !profiles) return false;
      const { executor, variant } = profile;
      if (!(executor in profiles)) return false;
      if (variant === null) return true;
      return variant in profiles[executor];
    },
    [profiles]
  );

  // ============================================================================
  // Single initialization effect
  // ============================================================================
  useEffect(() => {
    if (hasInitialized.current) return;
    if (scratchLoading) return;
    if (!projectsById) return;
    if (!profiles) return;
    if (initialRepos === undefined) return; // Wait for initial repos to be defined (can be empty array)

    hasInitialized.current = true;
    const navState = navStateRef.current;

    // Clear navigation state immediately to prevent re-initialization
    if (navState?.preferredRepos || navState?.initialPrompt) {
      navigate(location.pathname, { replace: true, state: {} });
    }

    // Determine initialization source and execute
    initializeState({
      navState,
      scratch,
      initialRepos,
      initialProjectId,
      projectsById,
      profiles,
      isValidProfile,
      dispatch,
    });
  }, [
    scratchLoading,
    projectsById,
    profiles,
    initialRepos,
    initialProjectId,
    scratch,
    isValidProfile,
    navigate,
    location.pathname,
  ]);

  // ============================================================================
  // Auto-select project when none selected
  // ============================================================================
  const hasAttemptedAutoSelect = useRef(false);
  const initialProjectIdRef = useRef(initialProjectId);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    if (hasAttemptedAutoSelect.current) return;
    if (state.projectId) return;
    if (!projectsById || projectsLoading) return;

    hasAttemptedAutoSelect.current = true;

    // Priority 1: Use initialProjectId from last workspace
    if (
      initialProjectIdRef.current &&
      initialProjectIdRef.current in projectsById
    ) {
      dispatch({ type: 'SET_PROJECT', projectId: initialProjectIdRef.current });
      return;
    }

    // Priority 2: Most recently created project
    const projectsList = Object.values(projectsById);
    if (projectsList.length > 0) {
      const sortedProjects = [...projectsList].sort(
        (a, b) =>
          new Date(b.created_at as unknown as string).getTime() -
          new Date(a.created_at as unknown as string).getTime()
      );
      dispatch({ type: 'SET_PROJECT', projectId: sortedProjects[0].id });
    } else {
      // Priority 3: Create default project
      projectsApi
        .create({ name: 'My first project', repositories: [] })
        .then((newProject) => {
          dispatch({ type: 'SET_PROJECT', projectId: newProject.id });
        })
        .catch((e) => {
          console.error(
            '[useCreateModeState] Failed to create default project:',
            e
          );
        });
    }
  }, [state.phase, state.projectId, projectsById, projectsLoading]);

  // ============================================================================
  // Persistence to scratch (debounced)
  // ============================================================================
  const { debounced: debouncedSave } = useDebouncedCallback(
    async (data: DraftWorkspaceData) => {
      const isEmpty =
        !data.message.trim() &&
        !data.project_id &&
        data.repos.length === 0 &&
        !data.selected_profile;

      if (isEmpty && !scratch) return;

      try {
        await updateScratch({
          payload: { type: 'DRAFT_WORKSPACE', data },
        });
      } catch (e) {
        console.error('[useCreateModeState] Failed to save:', e);
      }
    },
    500
  );

  useEffect(() => {
    if (state.phase !== 'ready') return;

    debouncedSave({
      message: state.message,
      project_id: state.projectId,
      repos: state.repos.map((r) => ({
        repo_id: r.repo.id,
        target_branch: r.targetBranch ?? '',
      })),
      selected_profile: state.profile,
    });
  }, [
    state.phase,
    state.message,
    state.projectId,
    state.repos,
    state.profile,
    debouncedSave,
  ]);

  // ============================================================================
  // Derived state
  // ============================================================================
  const repos = useMemo(() => state.repos.map((r) => r.repo), [state.repos]);

  const targetBranches = useMemo(
    () =>
      state.repos.reduce(
        (acc, r) => {
          acc[r.repo.id] = r.targetBranch;
          return acc;
        },
        {} as Record<string, string | null>
      ),
    [state.repos]
  );

  // ============================================================================
  // Actions
  // ============================================================================
  const setSelectedProjectId = useCallback((id: string | null) => {
    dispatch({ type: 'SET_PROJECT', projectId: id });
  }, []);

  const setMessage = useCallback((message: string) => {
    dispatch({ type: 'SET_MESSAGE', message });
  }, []);

  const setSelectedProfile = useCallback(
    (profile: ExecutorProfileId | null) => {
      dispatch({ type: 'SET_PROFILE', profile });
    },
    []
  );

  const addRepo = useCallback((repo: Repo) => {
    // Default branch will be auto-selected by CreateModeReposSectionContainer
    dispatch({ type: 'ADD_REPO', repo, targetBranch: null });
  }, []);

  const removeRepo = useCallback((repoId: string) => {
    dispatch({ type: 'REMOVE_REPO', repoId });
  }, []);

  const clearRepos = useCallback(() => {
    dispatch({ type: 'CLEAR_REPOS' });
  }, []);

  const setTargetBranch = useCallback((repoId: string, branch: string) => {
    dispatch({ type: 'SET_TARGET_BRANCH', repoId, branch });
  }, []);

  const clearDraft = useCallback(async () => {
    try {
      await deleteScratch();
      dispatch({ type: 'CLEAR' });
    } catch (e) {
      console.error('[useCreateModeState] Failed to clear:', e);
    }
  }, [deleteScratch]);

  return {
    selectedProjectId: state.projectId,
    repos,
    targetBranches,
    selectedProfile: state.profile,
    message: state.message,
    isLoading: scratchLoading,
    hasInitialValue: state.phase === 'ready',
    setSelectedProjectId,
    setMessage,
    setSelectedProfile,
    addRepo,
    removeRepo,
    clearRepos,
    setTargetBranch,
    clearDraft,
  };
}

// ============================================================================
// Initialization helper (pure-ish function for testability)
// ============================================================================

interface InitializeParams {
  navState: LocationState | null;
  scratch: ReturnType<typeof useScratch>['scratch'];
  initialRepos: RepoWithTargetBranch[] | undefined;
  initialProjectId: string | undefined;
  projectsById: Record<string, { id: string; created_at: unknown }>;
  profiles: Record<string, Record<string, unknown>>;
  isValidProfile: (profile: ExecutorProfileId | null) => boolean;
  dispatch: React.Dispatch<DraftAction>;
}

async function initializeState({
  navState,
  scratch,
  initialRepos,
  initialProjectId,
  projectsById,
  isValidProfile,
  dispatch,
}: InitializeParams): Promise<void> {
  try {
    // Priority 1: Navigation state (preferredRepos and/or initialPrompt)
    const hasPreferredRepos =
      navState?.preferredRepos && navState.preferredRepos.length > 0;
    const hasInitialPrompt = !!navState?.initialPrompt;

    if (hasPreferredRepos || hasInitialPrompt) {
      const data: Partial<DraftState> = {};
      let appliedNavState = false;

      // Handle project_id from navigation state (e.g., from duplicate/spin-off)
      if (navState?.project_id && navState.project_id in projectsById) {
        data.projectId = navState.project_id;
      }

      // Handle preferred repos
      if (hasPreferredRepos) {
        const repoIds = navState!.preferredRepos!.map((r) => r.repo_id);
        try {
          const fetchedRepos = await repoApi.getBatch(repoIds);

          data.repos = fetchedRepos.map((repo) => {
            const pref = navState!.preferredRepos!.find(
              (p) => p.repo_id === repo.id
            );
            return { repo, targetBranch: pref?.target_branch || null };
          });
          appliedNavState = data.repos.length > 0;
        } catch (e) {
          console.warn(
            '[useCreateModeState] Failed to load preferred repos:',
            e
          );
        }
      }

      // Handle initial prompt (can be combined with preferred repos)
      if (hasInitialPrompt) {
        data.message = navState!.initialPrompt!;
        appliedNavState = true;
      }

      if (appliedNavState) {
        dispatch({ type: 'INIT_COMPLETE', data });
        return;
      }
    }

    // Priority 3: Restore from scratch
    const scratchData: DraftWorkspaceData | undefined =
      scratch?.payload?.type === 'DRAFT_WORKSPACE'
        ? scratch.payload.data
        : undefined;

    if (scratchData) {
      const restoredData: Partial<DraftState> = {};

      // Restore message
      if (scratchData.message) {
        restoredData.message = scratchData.message;
      }

      // Restore project if it still exists
      if (scratchData.project_id && scratchData.project_id in projectsById) {
        restoredData.projectId = scratchData.project_id;
      }

      // Restore profile if still valid
      if (
        scratchData.selected_profile &&
        isValidProfile(scratchData.selected_profile)
      ) {
        restoredData.profile = scratchData.selected_profile;
      }

      // Restore repos
      if (scratchData.repos.length > 0) {
        const initialRepoMap = new Map(
          (initialRepos ?? []).map((r) => [r.id, r])
        );
        const missingIds = scratchData.repos
          .map((r) => r.repo_id)
          .filter((id) => !initialRepoMap.has(id));

        let allRepos: (Repo | RepoWithTargetBranch)[] = [
          ...(initialRepos ?? []),
        ];
        if (missingIds.length > 0) {
          try {
            const fetched = await repoApi.getBatch(missingIds);
            allRepos = [...allRepos, ...fetched];
          } catch {
            // Continue without missing repos
          }
        }

        const repoMap = new Map(allRepos.map((r) => [r.id, r]));
        const restoredRepos: SelectedRepo[] = [];

        for (const draftRepo of scratchData.repos) {
          const fullRepo = repoMap.get(draftRepo.repo_id);
          if (fullRepo) {
            restoredRepos.push({
              repo: fullRepo,
              targetBranch: draftRepo.target_branch || null,
            });
          }
        }

        if (restoredRepos.length > 0) {
          restoredData.repos = restoredRepos;
        }
      }

      dispatch({ type: 'INIT_COMPLETE', data: restoredData });
      return;
    }

    // Priority 4: Use initial repos/project from props
    if (initialRepos && initialRepos.length > 0) {
      const repos: SelectedRepo[] = initialRepos.map((r) => ({
        repo: r,
        targetBranch: r.target_branch || null,
      }));

      dispatch({
        type: 'INIT_COMPLETE',
        data: {
          repos,
          projectId: initialProjectId ?? null,
        },
      });
      return;
    }

    // Priority 5: Fresh start
    dispatch({
      type: 'INIT_COMPLETE',
      data: { projectId: initialProjectId ?? null },
    });
  } catch (e) {
    console.error('[useCreateModeState] Initialization failed:', e);
    dispatch({
      type: 'INIT_ERROR',
      error: e instanceof Error ? e.message : 'Failed to initialize',
    });
  }
}
