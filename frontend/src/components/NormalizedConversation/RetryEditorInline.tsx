import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { VariantSelector } from '@/components/tasks/VariantSelector';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Send, X } from 'lucide-react';
import type { TaskAttempt } from 'shared/types';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useUserSystem } from '@/components/ConfigProvider';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import { useVariant } from '@/hooks/useVariant';
import { useRetryProcess } from '@/hooks/useRetryProcess';
import type { ExecutorAction, ExecutorProfileId } from 'shared/types';

export function RetryEditorInline({
  attempt,
  executionProcessId,
  initialContent,
  onCancelled,
}: {
  attempt: TaskAttempt;
  executionProcessId: string;
  initialContent: string;
  onCancelled?: () => void;
}) {
  const { t } = useTranslation(['common']);
  const attemptId = attempt.id;
  const { isAttemptRunning, attemptData } = useAttemptExecution(attemptId);
  const { data: branchStatus } = useBranchStatus(attemptId);
  const { profiles } = useUserSystem();
  const { projectId } = useProject();

  const [message, setMessage] = useState(initialContent);
  const [sendError, setSendError] = useState<string | null>(null);

  // Extract variant from the process being retried
  const processVariant = useMemo<string | null>(() => {
    const process = attemptData.processes?.find(
      (p) => p.id === executionProcessId
    );
    if (!process?.executor_action) return null;

    const extractProfile = (
      action: ExecutorAction | null
    ): ExecutorProfileId | null => {
      let curr: ExecutorAction | null = action;
      while (curr) {
        const typ = curr.typ;
        switch (typ.type) {
          case 'CodingAgentInitialRequest':
          case 'CodingAgentFollowUpRequest':
            return typ.executor_profile_id;
          case 'ScriptRequest':
            curr = curr.next_action;
            continue;
        }
      }
      return null;
    };

    return extractProfile(process.executor_action)?.variant ?? null;
  }, [attemptData.processes, executionProcessId]);

  const { selectedVariant, setSelectedVariant } = useVariant({
    processVariant,
    scratchVariant: undefined,
  });

  const retryMutation = useRetryProcess(
    attemptId,
    () => onCancelled?.(),
    (err) => setSendError((err as Error)?.message || 'Failed to send retry')
  );

  const isSending = retryMutation.isPending;
  const canSend = !isAttemptRunning && !!message.trim();

  const onCancel = () => {
    onCancelled?.();
  };

  const onSend = useCallback(() => {
    if (!canSend) return;
    setSendError(null);
    retryMutation.mutate({
      message,
      variant: selectedVariant,
      executionProcessId,
      branchStatus,
      processes: attemptData.processes,
    });
  }, [
    canSend,
    retryMutation,
    message,
    selectedVariant,
    executionProcessId,
    branchStatus,
    attemptData.processes,
  ]);

  const handleCmdEnter = useCallback(() => {
    if (canSend && !isSending) {
      onSend();
    }
  }, [canSend, isSending, onSend]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <WYSIWYGEditor
          placeholder="Edit and resend your message..."
          value={message}
          onChange={setMessage}
          disabled={isSending}
          onCmdEnter={handleCmdEnter}
          className={cn('min-h-[40px]', 'bg-background')}
          projectId={projectId}
          taskAttemptId={attemptId}
        />
        {isSending && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/60">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <VariantSelector
          selectedVariant={selectedVariant}
          onChange={setSelectedVariant}
          currentProfile={profiles?.[attempt.executor] ?? null}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isSending}>
            <X className="h-3 w-3 mr-1" />{' '}
            {t('buttons.cancel', { ns: 'common' })}
          </Button>
          <Button onClick={onSend} disabled={!canSend || isSending}>
            <Send className="h-3 w-3 mr-1" />{' '}
            {t('buttons.send', { ns: 'common', defaultValue: 'Send' })}
          </Button>
        </div>
      </div>

      {sendError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{sendError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
