import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Terminal } from 'lucide-react';

import { useTerminal } from '@/contexts/TerminalContext';
import { TerminalTabBar } from '@/components/terminal/TerminalTabBar';
import { XTermInstance } from '@/components/terminal/XTermInstance';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';

export function TerminalPanel() {
  const { t } = useTranslation('tasks');
  const { attemptId: rawAttemptId } = useParams<{ attemptId?: string }>();
  const attemptId =
    rawAttemptId && rawAttemptId !== 'latest' ? rawAttemptId : undefined;

  const { data: attempt } = useTaskAttempt(attemptId ?? '');
  const { getTabsForAttempt, getActiveTab, createTab, closeTab, setActiveTab } =
    useTerminal();

  const tabs = attemptId ? getTabsForAttempt(attemptId) : [];
  const activeTab = attemptId ? getActiveTab(attemptId) : null;
  const cwd = attempt?.container_ref;

  useEffect(() => {
    if (attemptId && cwd && tabs.length === 0) {
      createTab(attemptId, cwd);
    }
  }, [attemptId, cwd, tabs.length, createTab]);

  if (!attemptId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Terminal className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>{t('terminal.noAttempt', 'Select an attempt to open terminal')}</p>
        </div>
      </div>
    );
  }

  if (!cwd) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Terminal className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>Workspace not ready</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TerminalTabBar
        tabs={tabs}
        activeTabId={activeTab?.id ?? null}
        onTabSelect={(tabId) => setActiveTab(attemptId, tabId)}
        onTabClose={(tabId) => closeTab(attemptId, tabId)}
        onNewTab={() => createTab(attemptId, cwd)}
      />
      <div className="relative flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <XTermInstance
            key={tab.id}
            attemptId={attemptId}
            isActive={tab.id === activeTab?.id}
            onClose={() => closeTab(attemptId, tab.id)}
          />
        ))}
      </div>
    </div>
  );
}
