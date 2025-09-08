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
  onCancel 
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
    <div className="pl-8 pr-4 py-2 bg-muted/50 border-l-2 border-primary">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment..."
        className="w-full p-2 text-xs font-mono bg-background border border-border rounded resize-none min-h-[60px] focus:outline-none focus:ring-1 focus:ring-primary"
        rows={3}
      />
      <div className="mt-2 flex gap-2">
        <Button 
          size="sm" 
          onClick={handleSave}
          disabled={!value.trim()}
          className="text-xs"
        >
          Save comment
        </Button>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={handleCancel}
          className="text-xs"
        >
          Cancel
        </Button>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Press Ctrl+Enter to save, Esc to cancel
      </div>
    </div>
  );
}
