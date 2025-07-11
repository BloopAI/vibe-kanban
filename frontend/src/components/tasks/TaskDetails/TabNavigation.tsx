import { GitCompare, MessageSquare } from 'lucide-react';
import { useContext } from 'react';
import { TaskDetailsContext } from '@/components/context/taskDetailsContext.ts';

type Props = {
  activeTab: 'logs' | 'diffs';
  setActiveTab: (tab: 'logs' | 'diffs') => void;
  setUserSelectedTab: (tab: boolean) => void;
};

function TabNavigation({ activeTab, setActiveTab, setUserSelectedTab }: Props) {
  const { diff } = useContext(TaskDetailsContext);
  return (
    <div className="border-b bg-muted/30">
      <div className="flex px-4">
        <button
          onClick={() => {
            console.log('Logs tab clicked - setting activeTab to logs');
            setActiveTab('logs');
            setUserSelectedTab(true);
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
            console.log('Diffs tab clicked - setting activeTab to diffs');
            setActiveTab('diffs');
            setUserSelectedTab(true);
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
      </div>
    </div>
  );
}

export default TabNavigation;
