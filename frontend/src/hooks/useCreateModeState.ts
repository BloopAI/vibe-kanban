import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface LocationState {
  duplicatePrompt?: string | null;
}

// Fixed UUID for the universal workspace draft
const DRAFT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

interface UseCreateModeStateParams {
  initialProjectId?: string;
  initialRepos?: RepoWithTargetBranch[];
}

interface UseCreateModeStateResult {
  // State
  selectedProjectId: string | null;
  repos: Repo[];
  targetBranches: Record<string, string>;
  selectedProfile: ExecutorProfileId | null;
  message: string;
  isLoading: boolean;
  /** Whether the initial value has been applied from scratch */
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
  // Router hooks for duplicate prompt handling
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as LocationState | null;

  // Fetch validation data
  const { projectsById, isLoading } = useProjects();
  const { profiles } = useUserSystem();

  // Initialization guards
  const hasInitializedFromScratch = useRef(false);
  const hasInitializedRepos = useRef(false);
  const hasInitializedProject = useRef(false);
  const hasAppliedDuplicatePrompt = useRef(false);

  // Validation helper for executor profiles
  const isValidProfile = useMemo(() => {
    return (profile: ExecutorProfileId | null): boolean => {
      if (!profile || !profiles) return false;
      const { executor, variant } = profile;
      if (!(executor in profiles)) return false;
      if (variant === null) return true;
      return variant in profiles[executor];
    };
  }, [profiles]);

  // Core state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [repos, setRepos] = useState<Repo[]>([]);
  const [targetBranches, setTargetBranches] = useState<Record<string, string>>(
    {}
  );
  const [selectedProfile, setSelectedProfile] =
    useState<ExecutorProfileId | null>(null);
  const [message, setMessage] = useState('');
  const [hasInitialValue, setHasInitialValue] = useState(false);

  // Scratch persistence
  const {
    scratch,
    updateScratch,
    deleteScratch,
    isLoading: isScratchLoading,
  } = useScratch(ScratchType.DRAFT_WORKSPACE, DRAFT_WORKSPACE_ID);

  const scratchData: DraftWorkspaceData | undefined =
    scratch?.payload?.type === 'DRAFT_WORKSPACE'
      ? scratch.payload.data
      : undefined;

  // Initialize from scratch (once, when all required data is available)
  useEffect(() => {
    if (hasInitializedFromScratch.current) return;
    if (isScratchLoading) return;
    if (!initialRepos) return;
    if (!projectsById) return; // Wait for projects to validate
    if (!profiles) return; // Wait for profiles to validate

    hasInitializedFromScratch.current = true;
    setHasInitialValue(true);

    if (!scratchData) return;

    // Restore message (no validation needed)
    if (scratchData.message) {
      setMessage(scratchData.message);
    }

    // Restore project_id only if it still exists
    if (scratchData.project_id && scratchData.project_id in projectsById) {
      setSelectedProjectId(scratchData.project_id);
      hasInitializedProject.current = true;
    }

    // Restore executor profile only if it's still valid
    if (
      scratchData.selected_profile &&
      isValidProfile(scratchData.selected_profile)
    ) {
      setSelectedProfile(scratchData.selected_profile);
    }

    // Restore repos (async - fetch any missing from API)
    if (scratchData.repos.length > 0) {
      const restoreRepos = async () => {
        const initialRepoMap = new Map(initialRepos.map((r) => [r.id, r]));
        const missingIds = scratchData.repos
          .map((r) => r.repo_id)
          .filter((id) => !initialRepoMap.has(id));

        let allRepos: (Repo | RepoWithTargetBranch)[] = [...initialRepos];
        if (missingIds.length > 0) {
          try {
            const fetchedRepos = await repoApi.getBatch(missingIds);
            allRepos = [...initialRepos, ...fetchedRepos];
          } catch (e) {
            console.error('[useCreateModeState] Failed to fetch repos:', e);
          }
        }

        const repoMap = new Map(allRepos.map((r) => [r.id, r]));
        const restoredRepos: Repo[] = [];
        const restoredBranches: Record<string, string> = {};

        for (const draftRepo of scratchData.repos) {
          const fullRepo = repoMap.get(draftRepo.repo_id);
          if (fullRepo) {
            restoredRepos.push(fullRepo);
            restoredBranches[draftRepo.repo_id] = draftRepo.target_branch;
          }
        }

        if (restoredRepos.length > 0) {
          hasInitializedRepos.current = true;
          setRepos(restoredRepos);
          setTargetBranches(restoredBranches);
        }
      };

      restoreRepos();
    }
  }, [
    isScratchLoading,
    scratchData,
    initialRepos,
    projectsById,
    profiles,
    isValidProfile,
  ]);

  // Initialize repos from props (if not restored from scratch)
  useEffect(() => {
    if (
      !hasInitializedRepos.current &&
      initialRepos &&
      initialRepos.length > 0
    ) {
      hasInitializedRepos.current = true;
      setRepos(initialRepos);
      setTargetBranches(
        initialRepos.reduce(
          (acc, repo) => {
            acc[repo.id] = repo.target_branch;
            return acc;
          },
          {} as Record<string, string>
        )
      );
    }
  }, [initialRepos]);

  // Initialize project from props (if not restored from scratch)
  useEffect(() => {
    if (!hasInitializedProject.current && initialProjectId) {
      hasInitializedProject.current = true;
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  // Track if we've attempted auto-selection
  const hasAttemptedAutoSelect = useRef(false);

  // Auto-select first project or create "My first project" when no project is selected
  useEffect(() => {
    // Wait for scratch initialization to complete (hasInitialValue is set after initialization)
    if (!hasInitialValue) return;
    // Only run once
    if (hasAttemptedAutoSelect.current) return;
    // Skip if already have a project from scratch or props
    if (selectedProjectId) return;
    // Wait for projects to load
    if (!projectsById || isLoading) return;

    hasAttemptedAutoSelect.current = true;

    const projectsList = Object.values(projectsById);

    if (projectsList.length > 0) {
      // Auto-select the first project (sorted by created_at desc)
      const sortedProjects = [...projectsList].sort(
        (a, b) =>
          new Date(b.created_at as unknown as string).getTime() -
          new Date(a.created_at as unknown as string).getTime()
      );
      setSelectedProjectId(sortedProjects[0].id);
    } else {
      // Create "My first project" if no projects exist
      const createDefaultProject = async () => {
        try {
          const newProject = await projectsApi.create({
            name: 'My first project',
            repositories: [],
          });
          setSelectedProjectId(newProject.id);
        } catch (e) {
          console.error(
            '[useCreateModeState] Failed to create default project:',
            e
          );
        }
      };
      createDefaultProject();
    }
  }, [hasInitialValue, selectedProjectId, projectsById, isLoading]);

  // Handle duplicate prompt from navigation state
  useEffect(() => {
    if (hasAppliedDuplicatePrompt.current) return;
    if (!locationState?.duplicatePrompt) return;

    hasAppliedDuplicatePrompt.current = true;
    setMessage(locationState.duplicatePrompt);

    // Clear the navigation state to prevent re-applying on subsequent renders
    navigate(location.pathname, { replace: true, state: {} });
  }, [locationState, location.pathname, navigate]);

  // Debounced save to scratch
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
          payload: {
            type: 'DRAFT_WORKSPACE',
            data,
          },
        });
      } catch (e) {
        console.error('[useCreateModeState] Failed to save:', e);
      }
    },
    500
  );

  // Save state changes to scratch
  useEffect(() => {
    if (!hasInitializedFromScratch.current) return;

    debouncedSave({
      message,
      project_id: selectedProjectId,
      repos: repos.map((r) => ({
        repo_id: r.id,
        target_branch: targetBranches[r.id] ?? 'main',
      })),
      selected_profile: selectedProfile,
    });
  }, [
    message,
    selectedProjectId,
    repos,
    targetBranches,
    selectedProfile,
    debouncedSave,
  ]);

  // Actions
  const addRepo = useCallback((repo: Repo) => {
    setRepos((prev) =>
      prev.some((r) => r.id === repo.id) ? prev : [...prev, repo]
    );
  }, []);

  const removeRepo = useCallback((repoId: string) => {
    setRepos((prev) => prev.filter((r) => r.id !== repoId));
    setTargetBranches((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
  }, []);

  const clearRepos = useCallback(() => {
    setRepos([]);
    setTargetBranches({});
  }, []);

  const setTargetBranch = useCallback((repoId: string, branch: string) => {
    setTargetBranches((prev) => ({ ...prev, [repoId]: branch }));
  }, []);

  const clearDraft = useCallback(async () => {
    try {
      await deleteScratch();
    } catch (e) {
      console.error('[useCreateModeState] Failed to clear:', e);
    }
  }, [deleteScratch]);

  return {
    selectedProjectId,
    repos,
    targetBranches,
    selectedProfile,
    message,
    isLoading: isScratchLoading,
    hasInitialValue,
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
