import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { MessageSquare, Trash2, Edit2, X, Check } from 'lucide-react';
import { useDiffComments } from '@/contexts/DiffCommentsContext';
import { DiffComment, UpdateDiffCommentRequest } from '@/lib/types';

interface CommentDisplayProps {
  comment: DiffComment;
}

export const CommentDisplay: React.FC<CommentDisplayProps> = ({ comment }) => {
  const { updateComment, deleteComment } = useDiffComments();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.comment_text);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSaveEdit = async () => {
    const request: UpdateDiffCommentRequest = {
      comment_text: editText,
    };
    await updateComment(comment.id, request);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(comment.comment_text);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    
    setIsDeleting(true);
    await deleteComment(comment.id);
  };

  const getStatusBadgeVariant = () => {
    return comment.status === 'draft' ? 'secondary' : 'default';
  };

  const formatTime = (dateString: string) => {
    // Simple time formatting without external library
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  return (
    <Card className="p-3 mb-2 bg-muted/50">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Lines {comment.selection_start_line}-{comment.selection_end_line}
          </span>
          <Badge variant={getStatusBadgeVariant()} className="text-xs">
            {comment.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {comment.status === 'draft' && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsEditing(true)}
              title="Edit comment"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
          )}
          {comment.status === 'draft' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              title="Delete comment"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[60px] text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelEdit}
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={!editText.trim() || editText === comment.comment_text}
            >
              <Check className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-sm whitespace-pre-wrap">{comment.comment_text}</div>
      )}
      
      <div className="mt-2 text-xs text-muted-foreground">
        {comment.status === 'submitted' && comment.submitted_at
          ? `Submitted ${formatTime(comment.submitted_at)}`
          : `Created ${formatTime(comment.created_at)}`}
      </div>
    </Card>
  );
};