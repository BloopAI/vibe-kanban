import { PlusIcon, XIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { TerminalTab } from '@/contexts/TerminalContext';

interface TerminalTabBarProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

export function TerminalTabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
}: TerminalTabBarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border bg-secondary px-2 py-1">
      <div className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'group flex items-center gap-1 rounded px-2 py-1 text-sm cursor-pointer',
              tab.id === activeTabId
                ? 'bg-primary text-high'
                : 'text-low hover:bg-primary/50 hover:text-normal'
            )}
            onClick={() => onTabSelect(tab.id)}
          >
            <span className="truncate max-w-[120px]">{tab.title}</span>
            <button
              className={cn(
                'ml-1 rounded p-0.5 hover:bg-secondary',
                tab.id === activeTabId
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              )}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              aria-label="Close terminal"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <button
        className="flex items-center justify-center h-6 w-6 shrink-0 rounded text-low hover:text-normal hover:bg-primary/50"
        onClick={onNewTab}
        aria-label="New terminal"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
