import { GitCompare, MessageSquare, Cog, Monitor, Loader2 } from 'lucide-react';
import type { TabType } from '@/types/tabs';
import type { TaskAttempt } from 'shared/types';

type Props = {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  rightContent?: React.ReactNode;
  selectedAttempt: TaskAttempt | null;
  showPreview?: boolean;
  previewStatus?: 'idle' | 'searching' | 'ready' | 'error';
};

function TabNavigation({
  activeTab,
  setActiveTab,
  rightContent,
  showPreview = false,
  previewStatus = 'idle',
}: Props) {
  const baseTabs = [
    { id: 'logs' as TabType, label: 'Logs', icon: MessageSquare },
    { id: 'diffs' as TabType, label: 'Diffs', icon: GitCompare },
    { id: 'processes' as TabType, label: 'Processes', icon: Cog },
  ];

  const tabs = showPreview
    ? [
      ...baseTabs,
      { id: 'preview' as TabType, label: 'Preview', icon: Monitor },
    ]
    : baseTabs;

  const getTabClassName = (tabId: TabType) => {
    const baseClasses = 'flex items-center py-2 px-2 text-sm font-medium';
    const activeClasses = 'text-primary-foreground';
    const inactiveClasses =
      'text-secondary-foreground hover:text-primary-foreground';

    return `${baseClasses} ${activeTab === tabId ? activeClasses : inactiveClasses}`;
  };

  return (
    <div className="border-b border-dashed bg-background sticky top-0 z-10">
      <div className="flex items-center px-3 space-x-3">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={getTabClassName(id)}
          >
            {id === 'preview' && previewStatus === 'searching' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Icon className="h-4 w-4 mr-2" />
            )}
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center">{rightContent}</div>
      </div>
    </div>
  );
}

export default TabNavigation;
