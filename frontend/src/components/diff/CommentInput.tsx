import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { useDiffComments } from '@/contexts/DiffCommentsContext';
import { CreateDiffCommentRequest } from '@/lib/types';

interface CommentInputProps {
  taskId: string;
  attemptId: string;
  projectId: string;
}

export const CommentInput: React.FC<CommentInputProps> = ({ 
  taskId, 
  attemptId,
  projectId 
}) => {
  const {
    selectedLines,
    setSelectedLines,
    isCommentInputOpen,
    setIsCommentInputOpen,
    createComment,
  } = useDiffComments();
  
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isCommentInputOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isCommentInputOpen]);

  const handleCancel = () => {
    setCommentText('');
    setIsCommentInputOpen(false);
    setSelectedLines(null);
  };

  const handleSubmit = async () => {
    if (!selectedLines || !commentText.trim()) return;

    setIsSubmitting(true);
    try {
      const request: CreateDiffCommentRequest = {
        project_id: projectId,
        task_id: taskId,
        attempt_id: attemptId,
        file_path: selectedLines.file,
        old_line_number: null, // We'll need to track this if showing old line numbers
        new_line_number: selectedLines.start,
        selection_start_line: selectedLines.start,
        selection_end_line: selectedLines.end,
        comment_text: commentText,
      };

      await createComment(request);
      handleCancel();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isCommentInputOpen || !selectedLines) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-background border rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-muted-foreground">
          Add comment for lines {selectedLines.start}-{selectedLines.end} in{' '}
          <span className="font-mono text-xs">{selectedLines.file}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <Textarea
        ref={textareaRef}
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        placeholder="Add your comment..."
        className="min-h-[100px] mb-3"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) {
            handleSubmit();
          }
        }}
      />
      
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
        <Button 
          size="sm" 
          onClick={handleSubmit}
          disabled={!commentText.trim() || isSubmitting}
        >
          {isSubmitting ? 'Adding...' : 'Add to Draft'}
        </Button>
      </div>
    </div>
  );
};