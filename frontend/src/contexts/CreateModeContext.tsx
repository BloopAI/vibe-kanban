import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  useEffect,
} from 'react';
import type {
  Repo,
  ExecutorProfileId,
  RepoWithTargetBranch,
} from 'shared/types';

interface CreateModeContextValue {
  // Project selection
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;

  // Repo state
  repos: Repo[];
  addRepo: (repo: Repo) => void;
  removeRepo: (repoId: string) => void;

  // Target branches per repo
  targetBranches: Record<string, string>;
  setTargetBranch: (repoId: string, branch: string) => void;

  // Executor/variant selection
  selectedProfile: ExecutorProfileId | null;
  setSelectedProfile: (profile: ExecutorProfileId | null) => void;

  // Message
  message: string;
  setMessage: (message: string) => void;
}

const CreateModeContext = createContext<CreateModeContextValue | null>(null);

interface CreateModeProviderProps {
  children: ReactNode;
  initialProjectId?: string;
  initialRepos?: RepoWithTargetBranch[];
}

export function CreateModeProvider({
  children,
  initialProjectId,
  initialRepos,
}: CreateModeProviderProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjectId ?? null
  );
  // Extract Repo objects from RepoWithTargetBranch (omitting target_branch)
  const [repos, setRepos] = useState<Repo[]>(() =>
    (initialRepos ?? []).map((r) => ({
      id: r.id,
      path: r.path,
      name: r.name,
      display_name: r.display_name,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
  );
  // Initial repos updates from empty
  useEffect(() => {
    if (repos.length === 0) {
      setRepos(initialRepos ?? []);
    }
  }, [initialRepos, repos]);
  // Initial project updates from empty
  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedProjectId(initialProjectId ?? null);
    }
  }, [initialProjectId, selectedProjectId]);
  // Build target branches map from initial repos
  const [targetBranches, setTargetBranches] = useState<Record<string, string>>(
    () =>
      (initialRepos ?? []).reduce(
        (acc, repo) => {
          acc[repo.id] = repo.target_branch;
          return acc;
        },
        {} as Record<string, string>
      )
  );
  const [selectedProfile, setSelectedProfile] =
    useState<ExecutorProfileId | null>(null);
  const [message, setMessage] = useState('');

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

  const setTargetBranch = useCallback((repoId: string, branch: string) => {
    setTargetBranches((prev) => ({ ...prev, [repoId]: branch }));
  }, []);

  const value = useMemo<CreateModeContextValue>(
    () => ({
      selectedProjectId,
      setSelectedProjectId,
      repos,
      addRepo,
      removeRepo,
      targetBranches,
      setTargetBranch,
      selectedProfile,
      setSelectedProfile,
      message,
      setMessage,
    }),
    [
      selectedProjectId,
      repos,
      addRepo,
      removeRepo,
      targetBranches,
      setTargetBranch,
      selectedProfile,
      message,
    ]
  );

  return (
    <CreateModeContext.Provider value={value}>
      {children}
    </CreateModeContext.Provider>
  );
}

export function useCreateMode() {
  const context = useContext(CreateModeContext);
  if (!context) {
    throw new Error('useCreateMode must be used within a CreateModeProvider');
  }
  return context;
}
