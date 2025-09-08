
import { MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReview, type ReviewComment } from '@/contexts/ReviewProvider';

interface ReviewCommentRendererProps {
  comment: ReviewComment;
}

export function ReviewCommentRenderer({ comment }: ReviewCommentRendererProps) {
  const { deleteComment } = useReview();

  const handleDelete = () => {
    deleteComment(comment.id);
  };

  return (
    <div className="pl-8 pr-4 py-2 bg-muted/30 border-l-2 border-primary">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
          <MessageSquare className="h-3 w-3" />
          <span>Review comment</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          className="h-5 w-5 p-0 opacity-60 hover:opacity-100"
          title="Delete comment"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="text-xs font-mono whitespace-pre-wrap text-foreground">
        {comment.text}
      </div>
    </div>
  );
}
