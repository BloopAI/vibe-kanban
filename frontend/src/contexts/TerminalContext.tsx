import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';

export interface TerminalTab {
  id: string;
  title: string;
  workspaceId: string;
  cwd: string;
}

interface TerminalState {
  tabsByWorkspace: Record<string, TerminalTab[]>;
  activeTabByWorkspace: Record<string, string | null>;
}

type TerminalAction =
  | { type: 'CREATE_TAB'; workspaceId: string; cwd: string }
  | { type: 'CLOSE_TAB'; workspaceId: string; tabId: string }
  | { type: 'SET_ACTIVE_TAB'; workspaceId: string; tabId: string }
  | {
      type: 'UPDATE_TAB_TITLE';
      workspaceId: string;
      tabId: string;
      title: string;
    }
  | { type: 'CLEAR_WORKSPACE_TABS'; workspaceId: string };

function generateTabId(): string {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function terminalReducer(
  state: TerminalState,
  action: TerminalAction
): TerminalState {
  switch (action.type) {
    case 'CREATE_TAB': {
      const { workspaceId, cwd } = action;
      const existingTabs = state.tabsByWorkspace[workspaceId] || [];
      const newTab: TerminalTab = {
        id: generateTabId(),
        title: `Terminal ${existingTabs.length + 1}`,
        workspaceId,
        cwd,
      };
      return {
        ...state,
        tabsByWorkspace: {
          ...state.tabsByWorkspace,
          [workspaceId]: [...existingTabs, newTab],
        },
        activeTabByWorkspace: {
          ...state.activeTabByWorkspace,
          [workspaceId]: newTab.id,
        },
      };
    }

    case 'CLOSE_TAB': {
      const { workspaceId, tabId } = action;
      const tabs = state.tabsByWorkspace[workspaceId] || [];
      const newTabs = tabs.filter((t) => t.id !== tabId);
      const wasActive = state.activeTabByWorkspace[workspaceId] === tabId;
      let newActiveTab = state.activeTabByWorkspace[workspaceId];

      if (wasActive && newTabs.length > 0) {
        const closedIndex = tabs.findIndex((t) => t.id === tabId);
        const newIndex = Math.min(closedIndex, newTabs.length - 1);
        newActiveTab = newTabs[newIndex]?.id ?? null;
      } else if (newTabs.length === 0) {
        newActiveTab = null;
      }

      return {
        ...state,
        tabsByWorkspace: {
          ...state.tabsByWorkspace,
          [workspaceId]: newTabs,
        },
        activeTabByWorkspace: {
          ...state.activeTabByWorkspace,
          [workspaceId]: newActiveTab,
        },
      };
    }

    case 'SET_ACTIVE_TAB': {
      const { workspaceId, tabId } = action;
      return {
        ...state,
        activeTabByWorkspace: {
          ...state.activeTabByWorkspace,
          [workspaceId]: tabId,
        },
      };
    }

    case 'UPDATE_TAB_TITLE': {
      const { workspaceId, tabId, title } = action;
      const tabs = state.tabsByWorkspace[workspaceId] || [];
      return {
        ...state,
        tabsByWorkspace: {
          ...state.tabsByWorkspace,
          [workspaceId]: tabs.map((t) =>
            t.id === tabId ? { ...t, title } : t
          ),
        },
      };
    }

    case 'CLEAR_WORKSPACE_TABS': {
      const { workspaceId } = action;
      const restTabs = Object.fromEntries(
        Object.entries(state.tabsByWorkspace).filter(
          ([key]) => key !== workspaceId
        )
      );
      const restActive = Object.fromEntries(
        Object.entries(state.activeTabByWorkspace).filter(
          ([key]) => key !== workspaceId
        )
      );
      return {
        tabsByWorkspace: restTabs,
        activeTabByWorkspace: restActive,
      };
    }

    default:
      return state;
  }
}

interface TerminalContextType {
  getTabsForWorkspace: (workspaceId: string) => TerminalTab[];
  getActiveTab: (workspaceId: string) => TerminalTab | null;
  createTab: (workspaceId: string, cwd: string) => void;
  closeTab: (workspaceId: string, tabId: string) => void;
  setActiveTab: (workspaceId: string, tabId: string) => void;
  updateTabTitle: (workspaceId: string, tabId: string, title: string) => void;
  clearWorkspaceTabs: (workspaceId: string) => void;
}

const TerminalContext = createContext<TerminalContextType | null>(null);

interface TerminalProviderProps {
  children: ReactNode;
}

export function TerminalProvider({ children }: TerminalProviderProps) {
  const [state, dispatch] = useReducer(terminalReducer, {
    tabsByWorkspace: {},
    activeTabByWorkspace: {},
  });

  const getTabsForWorkspace = useCallback(
    (workspaceId: string): TerminalTab[] => {
      return state.tabsByWorkspace[workspaceId] || [];
    },
    [state.tabsByWorkspace]
  );

  const getActiveTab = useCallback(
    (workspaceId: string): TerminalTab | null => {
      const activeId = state.activeTabByWorkspace[workspaceId];
      if (!activeId) return null;
      const tabs = state.tabsByWorkspace[workspaceId] || [];
      return tabs.find((t) => t.id === activeId) || null;
    },
    [state.tabsByWorkspace, state.activeTabByWorkspace]
  );

  const createTab = useCallback((workspaceId: string, cwd: string) => {
    dispatch({ type: 'CREATE_TAB', workspaceId, cwd });
  }, []);

  const closeTab = useCallback((workspaceId: string, tabId: string) => {
    dispatch({ type: 'CLOSE_TAB', workspaceId, tabId });
  }, []);

  const setActiveTab = useCallback((workspaceId: string, tabId: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', workspaceId, tabId });
  }, []);

  const updateTabTitle = useCallback(
    (workspaceId: string, tabId: string, title: string) => {
      dispatch({ type: 'UPDATE_TAB_TITLE', workspaceId, tabId, title });
    },
    []
  );

  const clearWorkspaceTabs = useCallback((workspaceId: string) => {
    dispatch({ type: 'CLEAR_WORKSPACE_TABS', workspaceId });
  }, []);

  const value = useMemo(
    () => ({
      getTabsForWorkspace,
      getActiveTab,
      createTab,
      closeTab,
      setActiveTab,
      updateTabTitle,
      clearWorkspaceTabs,
    }),
    [
      getTabsForWorkspace,
      getActiveTab,
      createTab,
      closeTab,
      setActiveTab,
      updateTabTitle,
      clearWorkspaceTabs,
    ]
  );

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal must be used within TerminalProvider');
  }
  return context;
}
