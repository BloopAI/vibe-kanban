import { DiffCard } from '@/components/tasks/TaskDetails/DiffCard.tsx';
import { useContext, useState } from 'react';
import { TaskDiffContext, TaskDetailsContext, TaskSelectedAttemptContext } from '@/components/context/taskDetailsContext.ts';
import { Loader } from '@/components/ui/loader';
import { CommentInput } from '@/components/diff/CommentInput';
import { CommentsPanel } from '@/components/diff/CommentsPanel';
import { Button } from '@/components/ui/button';
import { MessageSquare, X } from 'lucide-react';

function DiffTab() {
  const { diff, diffLoading, diffError } = useContext(TaskDiffContext);
  const { task, projectId } = useContext(TaskDetailsContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const [showComments, setShowComments] = useState(false);

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
    <div className="h-full flex flex-col">
      {/* Comments Toggle Button */}
      <div className="flex justify-end px-4 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowComments(!showComments)}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          {showComments ? 'Hide Comments' : 'Show Comments'}
        </Button>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex gap-4 px-4 pb-4 min-h-0">
        {/* Diff View */}
        <div className={showComments ? 'flex-1' : 'w-full'}>
          <DiffCard diff={diff} deletable compact={false} className="h-full" />
          {selectedAttempt && (
            <CommentInput 
              taskId={task.id} 
              attemptId={selectedAttempt.id} 
              projectId={projectId} 
            />
          )}
        </div>
        
        {/* Comments Panel */}
        {showComments && selectedAttempt && (
          <div className="w-96 flex-shrink-0">
            <CommentsPanel 
              taskId={task.id} 
              attemptId={selectedAttempt.id}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default DiffTab;
