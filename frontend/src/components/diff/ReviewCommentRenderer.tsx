import { useState } from 'react';
import { Button } from '@/components/ui/button';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useReview, type ReviewComment } from '@/contexts/ReviewProvider';

interface ReviewCommentRendererProps {
  comment: ReviewComment;
  projectId?: string;
}

export function ReviewCommentRenderer({
  comment,
  projectId,
}: ReviewCommentRendererProps) {
  const { deleteComment, updateComment } = useReview();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);

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

  if (isEditing) {
    return (
      <div className="border-y bg-background p-4">
        <WYSIWYGEditor
          value={editText}
          onChange={setEditText}
          placeholder="Edit comment... (type @ to search files)"
          className="w-full bg-background text-foreground text-sm font-mono min-h-[60px]"
          projectId={projectId}
          onCmdEnter={handleSave}
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
    <div className="border-y bg-background p-4">
      <WYSIWYGEditor
        value={comment.text}
        disabled={true}
        className="text-sm"
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
