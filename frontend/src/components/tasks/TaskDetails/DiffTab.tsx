import { DiffCard } from '@/components/tasks/TaskDetails/DiffCard.tsx';
import { WorktreeDiff } from 'shared/types.ts';

type Props = {
  diffLoading: boolean;
  diffError: string | null;
  diff: WorktreeDiff | null;
  isBackgroundRefreshing: boolean;
  handleDeleteFileClick: (fileId: string) => void;
  deletingFiles: Set<string>;
};

function DiffTab({
  diffLoading,
  diffError,
  diff,
  isBackgroundRefreshing,
  handleDeleteFileClick,
  deletingFiles,
}: Props) {
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
      <DiffCard
        diff={diff}
        isBackgroundRefreshing={isBackgroundRefreshing}
        onDeleteFile={handleDeleteFileClick}
        deletingFiles={deletingFiles}
        compact={false}
        className="h-full"
      />
    </div>
  );
}

export default DiffTab;
