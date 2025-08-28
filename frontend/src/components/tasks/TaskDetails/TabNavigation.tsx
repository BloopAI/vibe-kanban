import { GitCompare, MessageSquare, Cog } from 'lucide-react';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import type { TabType } from '@/types/tabs';
import type { TaskAttempt } from 'shared/types';

type Props = {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  rightContent?: React.ReactNode;
  selectedAttempt: TaskAttempt | null;
};

function TabNavigation({
  activeTab,
  setActiveTab,
  rightContent,
  selectedAttempt,
}: Props) {
  const { attemptData } = useAttemptExecution(selectedAttempt?.id);
  return (
    <div className="border-b border-dashed bg-secondary sticky top-0 z-10">
      <div className="flex items-center px-4">
        <button
          onClick={() => {
            setActiveTab('logs');
          }}
          className={`flex items-center px-4 py-2 text-sm font-medium ${
            activeTab === 'logs'
              ? 'text-primary bg-background'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Logs
        </button>

        <button
          onClick={() => {
            setActiveTab('diffs');
          }}
          className={`flex items-center px-4 py-2 text-sm font-medium ${
            activeTab === 'diffs'
              ? 'text-primary bg-background'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <GitCompare className="h-4 w-4 mr-2" />
          Diffs
        </button>
        <button
          onClick={() => {
            setActiveTab('processes');
          }}
          className={`flex items-center px-4 py-2 text-sm font-medium ${
            activeTab === 'processes'
              ? 'text-primary bg-background'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <Cog className="h-4 w-4 mr-2" />
          Processes
          {attemptData.processes && attemptData.processes.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
              {attemptData.processes.length}
            </span>
          )}
        </button>
        <div className="ml-auto flex items-center">{rightContent}</div>
      </div>
    </div>
  );
}

export default TabNavigation;
