import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CreateModeInitialState } from '@/hooks/useCreateModeState';

export type ProjectRightSidebarMode =
  | { type: 'issue' }
  | {
      type: 'workspace-create';
      initialState: CreateModeInitialState | null;
      instanceId: number;
    };

interface ProjectRightSidebarContextValue {
  mode: ProjectRightSidebarMode;
  showIssuePanel: () => void;
  openWorkspaceCreate: (initialState?: CreateModeInitialState | null) => void;
}

const ProjectRightSidebarContext =
  createContext<ProjectRightSidebarContextValue | null>(null);

export function ProjectRightSidebarProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [mode, setMode] = useState<ProjectRightSidebarMode>({ type: 'issue' });
  const createInstanceRef = useRef(0);

  const showIssuePanel = useCallback(() => {
    setMode({ type: 'issue' });
  }, []);

  const openWorkspaceCreate = useCallback(
    (initialState: CreateModeInitialState | null = null) => {
      createInstanceRef.current += 1;
      setMode({
        type: 'workspace-create',
        initialState,
        instanceId: createInstanceRef.current,
      });
    },
    []
  );

  const value = useMemo(
    () => ({
      mode,
      showIssuePanel,
      openWorkspaceCreate,
    }),
    [mode, showIssuePanel, openWorkspaceCreate]
  );

  return (
    <ProjectRightSidebarContext.Provider value={value}>
      {children}
    </ProjectRightSidebarContext.Provider>
  );
}

export function useProjectRightSidebar() {
  const context = useContext(ProjectRightSidebarContext);
  if (!context) {
    throw new Error(
      'useProjectRightSidebar must be used within ProjectRightSidebarProvider'
    );
  }
  return context;
}

export function useProjectRightSidebarOptional() {
  return useContext(ProjectRightSidebarContext);
}
