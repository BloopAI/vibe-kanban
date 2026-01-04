import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Lock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskComment } from 'shared/types';

interface CommentItemProps {
  comment: TaskComment;
  onUpdate: (commentId: string, content: string, isInternal: boolean) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  isUpdating?: boolean;
  isDeleting?: boolean;
}

export function CommentItem({
  comment,
  onUpdate,
  onDelete,
  isUpdating = false,
  isDeleting = false,
}: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    await onUpdate(comment.id, editContent.trim(), comment.is_internal);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(comment.content);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this comment?')) {
      await onDelete(comment.id);
    }
  };

  // Format date
  const formatDate = (dateStr: string | Date) => {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get initials from author name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg',
        comment.is_internal && 'bg-yellow-50/50 dark:bg-yellow-950/20 border border-yellow-200/50 dark:border-yellow-800/30'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
          comment.is_internal
            ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
            : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
        )}
      >
        {getInitials(comment.author_name)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{comment.author_name}</span>
            <span className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</span>
            {comment.is_internal && (
              <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                <Lock className="h-3 w-3" />
                Internal
              </span>
            )}
          </div>

          {/* Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                disabled={isUpdating || isDeleting}
              >
                {isUpdating || isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Comment content */}
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[80px]"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSaveEdit} disabled={!editContent.trim() || isUpdating}>
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={isUpdating}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-foreground whitespace-pre-wrap">{comment.content}</div>
        )}
      </div>
    </div>
  );
}
