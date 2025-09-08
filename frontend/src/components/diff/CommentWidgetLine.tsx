import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useReview, type ReviewDraft } from '@/contexts/ReviewProvider';

interface CommentWidgetLineProps {
  draft: ReviewDraft;
  widgetKey: string;
  onSave: () => void;
  onCancel: () => void;
}

export function CommentWidgetLine({
  draft,
  widgetKey,
  onSave,
  onCancel,
}: CommentWidgetLineProps) {
  const { setDraft, addComment } = useReview();
  const [value, setValue] = useState(draft.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSave = () => {
    if (value.trim()) {
      addComment({
        filePath: draft.filePath,
        side: draft.side,
        lineNumber: draft.lineNumber,
        text: value.trim(),
      });
    }
    setDraft(widgetKey, null);
    onSave();
  };

  const handleCancel = () => {
    setDraft(widgetKey, null);
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  return (
    <div className="p-4 border-y">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment..."
        className="w-full bg-primary text-primary-foreground text-sm font-mono resize-none min-h-[60px] focus:outline-none focus:ring-1 focus:ring-primary"
        rows={3}
      />
      <div className="mt-2 flex gap-2">
        <Button size="xs" onClick={handleSave} disabled={!value.trim()}>
          Add review comment
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
