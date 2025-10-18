import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useProcessRetry } from '@/hooks/useProcessRetry';
import { TaskAttempt, type BaseAgentCapability } from 'shared/types';
import { useUserSystem } from '@/components/config-provider';
import { useDraftStream } from '@/hooks/follow-up/useDraftStream';
import { RetryEditorInline } from './RetryEditorInline';
import { useRetryUi } from '@/contexts/RetryUiContext';

const UserMessage = ({
  content,
  executionProcessId,
  taskAttempt,
}: {
  content: string;
  executionProcessId?: string;
  taskAttempt?: TaskAttempt;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const retryHook = useProcessRetry(taskAttempt);
  const { capabilities } = useUserSystem();
  const attemptId = taskAttempt?.id;
  const { retryDraft } = useDraftStream(attemptId);
  const { activeRetryProcessId, isProcessGreyed } = useRetryUi();

  const canFork = !!(
    taskAttempt?.executor &&
    capabilities?.[taskAttempt.executor]?.includes(
      'SESSION_FORK' as BaseAgentCapability
    )
  );

  // Enter retry mode: create retry draft; actual editor will render inline
  const startRetry = async () => {
    if (!executionProcessId || !taskAttempt) return;
    setIsEditing(true);
    retryHook?.startRetry(executionProcessId, content).catch(() => {
      // rollback if server call fails
      setIsEditing(false);
    });
  };

  // Exit editing state once draft disappears (sent/cancelled)
  useEffect(() => {
    if (!retryDraft?.retry_process_id) setIsEditing(false);
  }, [retryDraft?.retry_process_id]);

  // On reload or when server provides a retry_draft for this process, show editor
  useEffect(() => {
    if (
      executionProcessId &&
      retryDraft?.retry_process_id &&
      retryDraft.retry_process_id === executionProcessId
    ) {
      setIsEditing(true);
    }
  }, [executionProcessId, retryDraft?.retry_process_id]);

  const showRetryEditor =
    !!executionProcessId &&
    isEditing &&
    activeRetryProcessId === executionProcessId;
  const greyed =
    !!executionProcessId &&
    isProcessGreyed(executionProcessId) &&
    !showRetryEditor;

  const retryState = executionProcessId
    ? retryHook?.getRetryDisabledState(executionProcessId)
    : { disabled: true, reason: 'Missing process id' };
  const disabled = !!retryState?.disabled;
  const reason = retryState?.reason ?? undefined;
  const editTitle = disabled && reason ? reason : 'Edit message';

  return (
    <div className={`py-2 ${greyed ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="group bg-background px-4 py-2 text-sm flex gap-2">
        <div className="flex-1 py-3">
          {showRetryEditor ? (
            <RetryEditorInline
              attempt={taskAttempt as TaskAttempt}
              executionProcessId={executionProcessId as string}
              initialVariant={null}
              onCancelled={() => {
                setIsEditing(false);
              }}
            />
          ) : (
            <MarkdownRenderer
              content={content}
              className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light"
            />
          )}
        </div>
        {executionProcessId && canFork && !showRetryEditor && (
          <div className="flex flex-col opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto">
            <Button
              onClick={startRetry}
              variant="ghost"
              className="p-2"
              disabled={disabled}
              title={editTitle}
              aria-label="Edit message"
              aria-disabled={disabled}
            >
              <Pencil className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserMessage;
