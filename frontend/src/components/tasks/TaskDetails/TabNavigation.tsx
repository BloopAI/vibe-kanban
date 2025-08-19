import { GitCompare, MessageSquare, Cog } from 'lucide-react';
import { useContext } from 'react';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext.ts';
import type { TabType } from '@/types/tabs';

type Props = {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
};

function TabNavigation({ activeTab, setActiveTab }: Props) {
  const { attemptData } = useContext(TaskAttemptDataContext);
  return (
    <div className="border-b bg-muted/20">
      <div className="flex px-4">
        <button
          onClick={() => {
            setActiveTab('logs');
          }}
          className={`flex items-center px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'logs'
              ? 'border-primary text-primary bg-background'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Logs
        </button>

        <button
          onClick={() => {
            setActiveTab('diffs');
          }}
          className={`flex items-center px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'diffs'
              ? 'border-primary text-primary bg-background'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <GitCompare className="h-4 w-4 mr-2" />
          Diffs
        </button>
        <button
          onClick={() => {
            setActiveTab('processes');
          }}
          className={`flex items-center px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'processes'
              ? 'border-primary text-primary bg-background'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
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
      </div>
    </div>
  );
}

export default TabNavigation;
