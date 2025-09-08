import React, { useState, useRef, useEffect } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReview, type ReviewComment } from '@/contexts/ReviewProvider';

interface ReviewCommentRendererProps {
  comment: ReviewComment;
}

export function ReviewCommentRenderer({ comment }: ReviewCommentRendererProps) {
  const { deleteComment, updateComment } = useReview();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
    }
  }, [isEditing]);

  const handleDelete = () => {
    deleteComment(comment.id);
  };

  const handleEdit = () => {
    setEditText(comment.text);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editText.trim()) {
      updateComment(comment.id, editText.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(comment.text);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  if (isEditing) {
    return (
      <div className="border-y bg-background p-4">
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Edit comment..."
          className="w-full bg-background text-foreground text-sm font-mono resize-none min-h-[60px] focus:outline-none"
          rows={3}
        />
        <div className="mt-2 flex gap-2">
          <Button size="xs" onClick={handleSave} disabled={!editText.trim()}>
            Save changes
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={handleCancel}
            className="text-secondary-foreground"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-y bg-background p-4 flex gap-2 items-center">
      <div className="flex-1 text-sm whitespace-pre-wrap text-foreground">
        {comment.text}
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="xs"
          onClick={handleEdit}
          title="Edit comment"
          className="h-auto"
        >
          <Pencil className="h-3 w-3" />
        </Button>
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
    </div>
  );
}
