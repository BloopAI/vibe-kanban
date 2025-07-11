import { DiffCard } from '@/components/tasks/TaskDetails/DiffCard.tsx';
import { useContext } from 'react';
import { TaskDetailsContext } from '@/components/context/taskDetailsContext.ts';

function DiffTab() {
  const { diff, diffLoading, diffError } = useContext(TaskDetailsContext);

  if (diffLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
        <p className="text-muted-foreground ml-4">Loading changes...</p>
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
