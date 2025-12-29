import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { Repo, ExecutorProfileId } from 'shared/types';

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
}

export function CreateModeProvider({
  children,
  initialProjectId,
}: CreateModeProviderProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjectId ?? null
  );
  const [repos, setRepos] = useState<Repo[]>([]);
  const [targetBranches, setTargetBranches] = useState<Record<string, string>>(
    {}
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
