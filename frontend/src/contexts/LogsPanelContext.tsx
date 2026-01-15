import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { LogsPanelContent } from '@/components/ui-new/containers/LogsContentContainer';
import {
  useUiPreferencesStore,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';

interface LogsPanelContextValue {
  logsPanelContent: LogsPanelContent | null;
  logSearchQuery: string;
  logMatchIndices: number[];
  logCurrentMatchIdx: number;
  setLogSearchQuery: (query: string) => void;
  setLogMatchIndices: (indices: number[]) => void;
  handleLogPrevMatch: () => void;
  handleLogNextMatch: () => void;
  viewProcessInPanel: (processId: string) => void;
  viewToolContentInPanel: (
    toolName: string,
    content: string,
    command?: string
  ) => void;
}

const defaultValue: LogsPanelContextValue = {
  logsPanelContent: null,
  logSearchQuery: '',
  logMatchIndices: [],
  logCurrentMatchIdx: 0,
  setLogSearchQuery: () => {},
  setLogMatchIndices: () => {},
  handleLogPrevMatch: () => {},
  handleLogNextMatch: () => {},
  viewProcessInPanel: () => {},
  viewToolContentInPanel: () => {},
};

const LogsPanelContext = createContext<LogsPanelContextValue>(defaultValue);

interface LogsPanelProviderProps {
  children: ReactNode;
}

export function LogsPanelProvider({ children }: LogsPanelProviderProps) {
  const { rightMainPanelMode, setRightMainPanelMode } = useUiPreferencesStore();

  const [logsPanelContent, setLogsPanelContent] =
    useState<LogsPanelContent | null>(null);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logMatchIndices, setLogMatchIndices] = useState<number[]>([]);
  const [logCurrentMatchIdx, setLogCurrentMatchIdx] = useState(0);

  const logContentId =
    logsPanelContent?.type === 'process'
      ? logsPanelContent.processId
      : logsPanelContent?.type === 'tool'
        ? logsPanelContent.toolName
        : null;

  useEffect(() => {
    setLogSearchQuery('');
    setLogCurrentMatchIdx(0);
  }, [logContentId]);

  useEffect(() => {
    setLogCurrentMatchIdx(0);
  }, [logSearchQuery]);

  const handleLogPrevMatch = useCallback(() => {
    if (logMatchIndices.length === 0) return;
    setLogCurrentMatchIdx((prev) =>
      prev > 0 ? prev - 1 : logMatchIndices.length - 1
    );
  }, [logMatchIndices.length]);

  const handleLogNextMatch = useCallback(() => {
    if (logMatchIndices.length === 0) return;
    setLogCurrentMatchIdx((prev) =>
      prev < logMatchIndices.length - 1 ? prev + 1 : 0
    );
  }, [logMatchIndices.length]);

  const viewProcessInPanel = useCallback(
    (processId: string) => {
      if (rightMainPanelMode !== RIGHT_MAIN_PANEL_MODES.LOGS) {
        setRightMainPanelMode(RIGHT_MAIN_PANEL_MODES.LOGS);
      }
      setLogsPanelContent({ type: 'process', processId });
    },
    [rightMainPanelMode, setRightMainPanelMode]
  );

  const viewToolContentInPanel = useCallback(
    (toolName: string, content: string, command?: string) => {
      if (rightMainPanelMode !== RIGHT_MAIN_PANEL_MODES.LOGS) {
        setRightMainPanelMode(RIGHT_MAIN_PANEL_MODES.LOGS);
      }
      setLogsPanelContent({ type: 'tool', toolName, content, command });
    },
    [rightMainPanelMode, setRightMainPanelMode]
  );

  const value = useMemo(
    () => ({
      logsPanelContent,
      logSearchQuery,
      logMatchIndices,
      logCurrentMatchIdx,
      setLogSearchQuery,
      setLogMatchIndices,
      handleLogPrevMatch,
      handleLogNextMatch,
      viewProcessInPanel,
      viewToolContentInPanel,
    }),
    [
      logsPanelContent,
      logSearchQuery,
      logMatchIndices,
      logCurrentMatchIdx,
      handleLogPrevMatch,
      handleLogNextMatch,
      viewProcessInPanel,
      viewToolContentInPanel,
    ]
  );

  return (
    <LogsPanelContext.Provider value={value}>
      {children}
    </LogsPanelContext.Provider>
  );
}

export function useLogsPanel(): LogsPanelContextValue {
  return useContext(LogsPanelContext);
}
