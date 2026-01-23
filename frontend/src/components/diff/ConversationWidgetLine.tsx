import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SpinnerIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useReview, type ReviewDraft } from '@/contexts/ReviewProvider';
import { Scope, useKeyExit, useKeySubmitComment } from '@/keyboard';
import { useHotkeysContext } from 'react-hotkeys-hook';

interface ConversationWidgetLineProps {
  draft: ReviewDraft;
  widgetKey: string;
  onSave: () => void;
  onCancel: () => void;
  projectId?: string;
}

export function ConversationWidgetLine({
  draft,
  widgetKey,
  onSave,
  onCancel,
  projectId,
}: ConversationWidgetLineProps) {
  const { t } = useTranslation('tasks');
  const { setDraft, createConversation } = useReview();
  const [value, setValue] = useState(draft.text);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleSave = useCallback(async () => {
    if (!value.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await createConversation({
        filePath: draft.filePath,
        lineNumber: draft.lineNumber,
        side: draft.side,
        codeLine: draft.codeLine,
        initialMessage: value.trim(),
      });
      setDraft(widgetKey, null);
      onSave();
    } catch (err) {
      console.error('Failed to create conversation:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to create conversation'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    value,
    draft,
    setDraft,
    widgetKey,
    onSave,
    createConversation,
    isSubmitting,
  ]);

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
    when: value.trim() !== '' && !isSubmitting,
    preventDefault: true,
  });

  return (
    <div className="p-4 border-y bg-primary">
      <WYSIWYGEditor
        value={value}
        onChange={setValue}
        placeholder={t('conversation.thread.startPlaceholder')}
        className="w-full bg-primary text-primary-foreground text-sm font-mono min-h-[60px]"
        projectId={projectId}
        onCmdEnter={handleSave}
        autoFocus
        disabled={isSubmitting}
      />
      {error && <div className="mt-2 text-sm text-error">{error}</div>}
      <div className="mt-2 flex gap-2">
        <Button
          size="xs"
          onClick={handleSave}
          disabled={!value.trim() || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <SpinnerIcon className="size-icon-xs animate-spin mr-1" />
              {t('conversation.thread.starting')}
            </>
          ) : (
            t('conversation.thread.startConversation')
          )}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={handleCancel}
          className="text-secondary-foreground"
          disabled={isSubmitting}
        >
          {t('conversation.thread.cancel')}
        </Button>
      </div>
    </div>
  );
}
