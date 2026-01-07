import { Loader } from '@/components/ui/loader';
import { CommentItem } from './CommentItem';
import type { TaskComment } from 'shared/types';

interface CommentListProps {
  comments: TaskComment[];
  isLoading?: boolean;
  onUpdate: (commentId: string, content: string, isInternal: boolean) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  isUpdating?: boolean;
  isDeleting?: boolean;
}

export function CommentList({
  comments,
  isLoading = false,
  onUpdate,
  onDelete,
  isUpdating = false,
  isDeleting = false,
}: CommentListProps) {
  if (isLoading) {
    return (
      <div className="py-8">
        <Loader message="Loading comments..." size={24} />
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No comments yet. Be the first to comment!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <div key={comment.id} className="group">
          <CommentItem
            comment={comment}
            onUpdate={onUpdate}
            onDelete={onDelete}
            isUpdating={isUpdating}
            isDeleting={isDeleting}
          />
        </div>
      ))}
    </div>
  );
}
