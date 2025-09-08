import { Button } from '@/components/ui/button';
import { MessageSquare, Send, X } from 'lucide-react';
import { useReview } from '@/contexts/ReviewProvider';

interface ReviewSubmissionBarProps {
  onSubmitReview: (reviewMarkdown: string) => void;
}

export function ReviewSubmissionBar({
  onSubmitReview,
}: ReviewSubmissionBarProps) {
  const { comments, clearComments, generateReviewMarkdown } = useReview();

  if (comments.length === 0) return null;

  const handleSubmit = () => {
    const markdown = generateReviewMarkdown();
    onSubmitReview(markdown);
    clearComments();
  };

  const handleDiscard = () => {
    clearComments();
  };

  return (
    <div className="sticky bottom-0 bg-background border-t shadow-lg px-4 py-3 z-20">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="font-medium">
            {comments.length} review comment{comments.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4 mr-1" />
            Discard
          </Button>

          <Button
            onClick={handleSubmit}
            size="sm"
            className="bg-primary hover:bg-primary/90"
          >
            <Send className="h-4 w-4 mr-1" />
            Submit Review
          </Button>
        </div>
      </div>
    </div>
  );
}
