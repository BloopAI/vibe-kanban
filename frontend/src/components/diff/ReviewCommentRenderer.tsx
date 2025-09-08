import { Trash2 } from 'lucide-react';
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
    <div className="border-y bg-background p-4 flex gap-2 items-center">
      <div className="flex-1 text-sm whitespace-pre-wrap text-foreground">
        {comment.text}
      </div>
      <Button
        variant="ghost"
        size="xs"
        onClick={handleDelete}
        title="Delete comment"
        className="h-auto"
      >
        <Trash2 className="h-3 w-4" />
      </Button>
    </div>
  );
}
