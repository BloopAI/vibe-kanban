
import { useContext } from 'react';
import { Cog } from 'lucide-react';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext.ts';
import ProcessCard from './ProcessCard';

function LogsTab() {
  const { attemptData } = useContext(TaskAttemptDataContext);

  if (!attemptData.processes || attemptData.processes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Cog className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No execution processes found for this attempt.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 pb-20">
      <div className="space-y-3">
        {attemptData.processes.map((process) => (
          <ProcessCard key={process.id} process={process} />
        ))}
      </div>
    </div>
  );
}

export default LogsTab;
