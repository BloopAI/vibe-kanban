import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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
  const { t } = useTranslation('tasks');
  return (
    <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1">
      <div className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'group flex items-center gap-1 rounded-sm px-2 py-1 text-sm cursor-pointer',
              tab.id === activeTabId
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            )}
            onClick={() => onTabSelect(tab.id)}
          >
            <span className="truncate max-w-[120px]">{tab.title}</span>
            <button
              className={cn(
                'ml-1 rounded-sm p-0.5 hover:bg-muted',
                tab.id === activeTabId
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              )}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              aria-label={t('terminal.closeTab')}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onNewTab}
        aria-label={t('terminal.newTab')}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
