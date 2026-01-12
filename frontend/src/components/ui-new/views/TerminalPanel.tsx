import { useTranslation } from 'react-i18next';
import type { TerminalTab } from '@/contexts/TerminalContext';
import { TerminalTabBar } from '../terminal/TerminalTabBar';
import { XTermInstance } from '../terminal/XTermInstance';

interface TerminalPanelProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  workspaceId: string;
  containerRef: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

export function TerminalPanel({
  tabs,
  activeTabId,
  workspaceId,
  containerRef,
  onTabSelect,
  onTabClose,
  onNewTab,
}: TerminalPanelProps) {
  const { t } = useTranslation('tasks');

  if (!workspaceId || !containerRef) {
    return (
      <div className="flex h-full items-center justify-center text-low">
        {t('terminal.selectWorkspace')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TerminalTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={onTabSelect}
        onTabClose={onTabClose}
        onNewTab={onNewTab}
      />
      <div className="flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <XTermInstance
            key={tab.id}
            workspaceId={workspaceId}
            isActive={tab.id === activeTabId}
            onClose={() => onTabClose(tab.id)}
          />
        ))}
      </div>
    </div>
  );
}
