import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useReview, type ReviewDraft } from '@/contexts/ReviewProvider';
import { Scope, useKeyExit, useKeySubmitComment } from '@/keyboard';
import { useHotkeysContext } from 'react-hotkeys-hook';

interface CommentWidgetLineProps {
  draft: ReviewDraft;
  widgetKey: string;
  onSave: () => void;
  onCancel: () => void;
  projectId?: string;
}

export function CommentWidgetLine({
  draft,
  widgetKey,
  onSave,
  onCancel,
  projectId,
}: CommentWidgetLineProps) {
  const { setDraft, addComment } = useReview();
  const [value, setValue] = useState(draft.text);
  const { enableScope, disableScope } = useHotkeysContext();

  useEffect(() => {
    enableScope(Scope.EDIT_COMMENT);
    return () => {
      disableScope(Scope.EDIT_COMMENT);
    };
  }, [enableScope, disableScope]);

  const handleCancel = useCallback(() => {
    setDraft(widgetKey, null);
    onCancel();
  }, [setDraft, widgetKey, onCancel]);

  const handleSave = useCallback(() => {
    if (value.trim()) {
      addComment({
        filePath: draft.filePath,
        side: draft.side,
        lineNumber: draft.lineNumber,
        text: value.trim(),
        codeLine: draft.codeLine,
      });
    }
    setDraft(widgetKey, null);
    onSave();
  }, [value, draft, setDraft, widgetKey, onSave, addComment]);

  const handleSubmitShortcut = useCallback(
    (e?: KeyboardEvent) => {
      e?.preventDefault();
      handleSave();
    },
    [handleSave]
  );

  const exitOptions = useMemo(
    () => ({
      scope: Scope.EDIT_COMMENT,
    }),
    []
  );

  useKeyExit(handleCancel, exitOptions);

  useKeySubmitComment(handleSubmitShortcut, {
    scope: Scope.EDIT_COMMENT,
    enableOnFormTags: ['textarea', 'TEXTAREA'],
    when: value.trim() !== '',
    preventDefault: true,
  });

  return (
    <div className="p-4 border-y bg-primary">
      <WYSIWYGEditor
        value={value}
        onChange={setValue}
        placeholder="Add a comment... (type @ to search files)"
        className="w-full bg-primary text-primary-foreground text-sm font-mono min-h-[60px]"
        projectId={projectId}
        onCmdEnter={handleSave}
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
