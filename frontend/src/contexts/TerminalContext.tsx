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
  attemptId: string;
  cwd: string;
}

interface TerminalState {
  tabsByAttempt: Record<string, TerminalTab[]>;
  activeTabByAttempt: Record<string, string | null>;
}

type TerminalAction =
  | { type: 'CREATE_TAB'; attemptId: string; cwd: string }
  | { type: 'CLOSE_TAB'; attemptId: string; tabId: string }
  | { type: 'SET_ACTIVE_TAB'; attemptId: string; tabId: string }
  | {
      type: 'UPDATE_TAB_TITLE';
      attemptId: string;
      tabId: string;
      title: string;
    }
  | { type: 'CLEAR_ATTEMPT_TABS'; attemptId: string };

function generateTabId(): string {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function terminalReducer(
  state: TerminalState,
  action: TerminalAction
): TerminalState {
  switch (action.type) {
    case 'CREATE_TAB': {
      const { attemptId, cwd } = action;
      const existingTabs = state.tabsByAttempt[attemptId] || [];
      const newTab: TerminalTab = {
        id: generateTabId(),
        title: `Terminal ${existingTabs.length + 1}`,
        attemptId,
        cwd,
      };
      return {
        ...state,
        tabsByAttempt: {
          ...state.tabsByAttempt,
          [attemptId]: [...existingTabs, newTab],
        },
        activeTabByAttempt: {
          ...state.activeTabByAttempt,
          [attemptId]: newTab.id,
        },
      };
    }

    case 'CLOSE_TAB': {
      const { attemptId, tabId } = action;
      const tabs = state.tabsByAttempt[attemptId] || [];
      const newTabs = tabs.filter((t) => t.id !== tabId);
      const wasActive = state.activeTabByAttempt[attemptId] === tabId;
      let newActiveTab = state.activeTabByAttempt[attemptId];

      if (wasActive && newTabs.length > 0) {
        const closedIndex = tabs.findIndex((t) => t.id === tabId);
        const newIndex = Math.min(closedIndex, newTabs.length - 1);
        newActiveTab = newTabs[newIndex]?.id ?? null;
      } else if (newTabs.length === 0) {
        newActiveTab = null;
      }

      return {
        ...state,
        tabsByAttempt: {
          ...state.tabsByAttempt,
          [attemptId]: newTabs,
        },
        activeTabByAttempt: {
          ...state.activeTabByAttempt,
          [attemptId]: newActiveTab,
        },
      };
    }

    case 'SET_ACTIVE_TAB': {
      const { attemptId, tabId } = action;
      return {
        ...state,
        activeTabByAttempt: {
          ...state.activeTabByAttempt,
          [attemptId]: tabId,
        },
      };
    }

    case 'UPDATE_TAB_TITLE': {
      const { attemptId, tabId, title } = action;
      const tabs = state.tabsByAttempt[attemptId] || [];
      return {
        ...state,
        tabsByAttempt: {
          ...state.tabsByAttempt,
          [attemptId]: tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
        },
      };
    }

    case 'CLEAR_ATTEMPT_TABS': {
      const { attemptId } = action;
      const restTabs = Object.fromEntries(
        Object.entries(state.tabsByAttempt).filter(([key]) => key !== attemptId)
      );
      const restActive = Object.fromEntries(
        Object.entries(state.activeTabByAttempt).filter(
          ([key]) => key !== attemptId
        )
      );
      return {
        tabsByAttempt: restTabs,
        activeTabByAttempt: restActive,
      };
    }

    default:
      return state;
  }
}

interface TerminalContextType {
  getTabsForAttempt: (attemptId: string) => TerminalTab[];
  getActiveTab: (attemptId: string) => TerminalTab | null;
  createTab: (attemptId: string, cwd: string) => void;
  closeTab: (attemptId: string, tabId: string) => void;
  setActiveTab: (attemptId: string, tabId: string) => void;
  updateTabTitle: (attemptId: string, tabId: string, title: string) => void;
  clearAttemptTabs: (attemptId: string) => void;
}

const TerminalContext = createContext<TerminalContextType | null>(null);

interface TerminalProviderProps {
  children: ReactNode;
}

export function TerminalProvider({ children }: TerminalProviderProps) {
  const [state, dispatch] = useReducer(terminalReducer, {
    tabsByAttempt: {},
    activeTabByAttempt: {},
  });

  const getTabsForAttempt = useCallback(
    (attemptId: string): TerminalTab[] => {
      return state.tabsByAttempt[attemptId] || [];
    },
    [state.tabsByAttempt]
  );

  const getActiveTab = useCallback(
    (attemptId: string): TerminalTab | null => {
      const activeId = state.activeTabByAttempt[attemptId];
      if (!activeId) return null;
      const tabs = state.tabsByAttempt[attemptId] || [];
      return tabs.find((t) => t.id === activeId) || null;
    },
    [state.tabsByAttempt, state.activeTabByAttempt]
  );

  const createTab = useCallback((attemptId: string, cwd: string) => {
    dispatch({ type: 'CREATE_TAB', attemptId, cwd });
  }, []);

  const closeTab = useCallback((attemptId: string, tabId: string) => {
    dispatch({ type: 'CLOSE_TAB', attemptId, tabId });
  }, []);

  const setActiveTab = useCallback((attemptId: string, tabId: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', attemptId, tabId });
  }, []);

  const updateTabTitle = useCallback(
    (attemptId: string, tabId: string, title: string) => {
      dispatch({ type: 'UPDATE_TAB_TITLE', attemptId, tabId, title });
    },
    []
  );

  const clearAttemptTabs = useCallback((attemptId: string) => {
    dispatch({ type: 'CLEAR_ATTEMPT_TABS', attemptId });
  }, []);

  const value = useMemo(
    () => ({
      getTabsForAttempt,
      getActiveTab,
      createTab,
      closeTab,
      setActiveTab,
      updateTabTitle,
      clearAttemptTabs,
    }),
    [
      getTabsForAttempt,
      getActiveTab,
      createTab,
      closeTab,
      setActiveTab,
      updateTabTitle,
      clearAttemptTabs,
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
