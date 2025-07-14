import { DiffCard } from '@/components/tasks/TaskDetails/DiffCard.tsx';
import { useContext } from 'react';
import { TaskDiffContext } from '@/components/context/taskDetailsContext.ts';
import { Loader } from '@/components/ui/loader';

function DiffTab() {
  const { diff, diffLoading, diffError } = useContext(TaskDiffContext);

  if (diffLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader message="Loading changes..." size={32} />
      </div>
    );
  }

  if (diffError) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>{diffError}</p>
      </div>
    );
  }

  return (
    <div className="h-full px-4 pb-4">
      <DiffCard diff={diff} deletable compact={false} className="h-full" />
    </div>
  );
}

export default DiffTab;
