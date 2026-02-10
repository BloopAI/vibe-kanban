import {
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';
import type { LogsPanelContent } from '@/components/ui-new/containers/LogsContentContainer';
import {
  useWorkspacePanelState,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

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
  expandTerminal: () => void;
  collapseTerminal: () => void;
  isTerminalExpanded: boolean;
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
  expandTerminal: () => {},
  collapseTerminal: () => {},
  isTerminalExpanded: false,
};

const LogsPanelContext = createHmrContext<LogsPanelContextValue>(
  'LogsPanelContext',
  defaultValue
);

interface LogsPanelProviderProps {
  children: ReactNode;
}

export function LogsPanelProvider({ children }: LogsPanelProviderProps) {
  const { workspaceId, isCreateMode } = useWorkspaceContext();
  const { rightMainPanelMode, setRightMainPanelMode } = useWorkspacePanelState(
    isCreateMode ? undefined : workspaceId
  );
  const [logsPanelContent, setLogsPanelContent] =
    useState<LogsPanelContent | null>(null);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logMatchIndices, setLogMatchIndices] = useState<number[]>([]);
  const [logCurrentMatchIdx, setLogCurrentMatchIdx] = useState(0);

  const isTerminalExpanded = logsPanelContent?.type === 'terminal';

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

  // Collapse terminal when switching away from Logs panel mode
  useEffect(() => {
    if (
      rightMainPanelMode !== RIGHT_MAIN_PANEL_MODES.LOGS &&
      isTerminalExpanded
    ) {
      setLogsPanelContent(null);
    }
  }, [rightMainPanelMode, isTerminalExpanded]);

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

  const expandTerminal = useCallback(() => {
    if (rightMainPanelMode !== RIGHT_MAIN_PANEL_MODES.LOGS) {
      setRightMainPanelMode(RIGHT_MAIN_PANEL_MODES.LOGS);
    }
    setLogsPanelContent({ type: 'terminal' });
  }, [rightMainPanelMode, setRightMainPanelMode]);

  const collapseTerminal = useCallback(() => {
    setLogsPanelContent(null);
  }, []);

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
      expandTerminal,
      collapseTerminal,
      isTerminalExpanded,
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
      expandTerminal,
      collapseTerminal,
      isTerminalExpanded,
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
