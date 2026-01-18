import type { TerminalTab } from '@/contexts/TerminalContext';
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
  onTabClose,
}: TerminalPanelProps) {
  return (
    <div className="flex-1 overflow-hidden bg-secondary p-base">
      {tabs.map((tab) => (
        <XTermInstance
          key={tab.id}
          workspaceId={workspaceId}
          isActive={tab.id === activeTabId}
          onClose={() => onTabClose(tab.id)}
        />
      ))}
    </div>
  );
}
