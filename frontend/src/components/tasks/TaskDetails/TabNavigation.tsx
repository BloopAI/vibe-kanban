import { GitCompare, MessageSquare, Network, Cog } from 'lucide-react';
import { useContext } from 'react';
import {
  TaskAttemptDataContext,
  TaskDiffContext,
  TaskRelatedTasksContext,
} from '@/components/context/taskDetailsContext.ts';

type Props = {
  activeTab: 'logs' | 'diffs' | 'related' | 'processes';
  setActiveTab: (tab: 'logs' | 'diffs' | 'related' | 'processes') => void;
};

function TabNavigation({ activeTab, setActiveTab }: Props) {
  const { diff } = useContext(TaskDiffContext);
  const { totalRelatedCount } = useContext(TaskRelatedTasksContext);
  const { attemptData } = useContext(TaskAttemptDataContext);
  return (
    <div className="border-b bg-muted/30">
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
          {diff && diff.files.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
              {diff.files.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab('related');
          }}
          className={`flex items-center px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'related'
              ? 'border-primary text-primary bg-background'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <Network className="h-4 w-4 mr-2" />
          Related Tasks
          {totalRelatedCount > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
              {totalRelatedCount}
            </span>
          )}
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
