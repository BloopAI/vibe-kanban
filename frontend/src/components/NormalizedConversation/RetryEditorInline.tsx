import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { VariantSelector } from '@/components/tasks/VariantSelector';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Send, X } from 'lucide-react';
import { attemptsApi, executionProcessesApi, commitsApi } from '@/lib/api';
import type { TaskAttempt } from 'shared/types';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useUserSystem } from '@/components/ConfigProvider';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import {
  RestoreLogsDialog,
  type RestoreLogsDialogResult,
} from '@/components/dialogs';
import {
  shouldShowInLogs,
  isCodingAgent,
  PROCESS_RUN_REASONS,
} from '@/constants/processes';

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
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const canSend = !isAttemptRunning && !!message.trim();

  const onCancel = () => {
    onCancelled?.();
  };

  const onSend = useCallback(async () => {
    if (!canSend) return;
    setSendError(null);
    setIsSending(true);
    try {
      // Fetch process details and compute confirmation payload
      const proc = await executionProcessesApi.getDetails(executionProcessId);
      type WithBefore = { before_head_commit?: string | null };
      const before = (proc as WithBefore)?.before_head_commit || null;
      let targetSubject: string | null = null;
      let commitsToReset: number | null = null;
      let isLinear: boolean | null = null;
      if (before) {
        try {
          const info = await commitsApi.getInfo(attemptId, before);
          targetSubject = info.subject;
          const cmp = await commitsApi.compareToHead(attemptId, before);
          commitsToReset = cmp.is_linear ? cmp.ahead_from_head : null;
          isLinear = cmp.is_linear;
        } catch {
          /* ignore */
        }
      }

      const head = branchStatus?.head_oid || null;
      const dirty = !!branchStatus?.has_uncommitted_changes;
      const needReset = !!(before && (before !== head || dirty));
      const canGitReset = needReset && !dirty;

      // Compute later processes summary for UI
      const procs = (attemptData.processes || []).filter(
        (p) => !p.dropped && shouldShowInLogs(p.run_reason)
      );
      const idx = procs.findIndex((p) => p.id === executionProcessId);
      const later = idx >= 0 ? procs.slice(idx + 1) : [];
      const laterCount = later.length;
      const laterCoding = later.filter((p) =>
        isCodingAgent(p.run_reason)
      ).length;
      const laterSetup = later.filter(
        (p) => p.run_reason === PROCESS_RUN_REASONS.SETUP_SCRIPT
      ).length;
      const laterCleanup = later.filter(
        (p) => p.run_reason === PROCESS_RUN_REASONS.CLEANUP_SCRIPT
      ).length;

      // Ask user for confirmation
      let modalResult: RestoreLogsDialogResult | undefined;
      try {
        modalResult = await RestoreLogsDialog.show({
          targetSha: before,
          targetSubject,
          commitsToReset,
          isLinear,
          laterCount,
          laterCoding,
          laterSetup,
          laterCleanup,
          needGitReset: needReset,
          canGitReset,
          hasRisk: dirty,
          uncommittedCount: branchStatus?.uncommitted_count ?? 0,
          untrackedCount: branchStatus?.untracked_count ?? 0,
          initialWorktreeResetOn: true,
          initialForceReset: false,
        });
      } catch {
        setIsSending(false);
        return; // dialog closed
      }
      if (!modalResult || modalResult.action !== 'confirmed') {
        setIsSending(false);
        return;
      }

      // Send the retry request
      await attemptsApi.followUp(attemptId, {
        prompt: message,
        variant: selectedVariant,
        retry_process_id: executionProcessId,
        force_when_dirty: modalResult.forceWhenDirty ?? false,
        perform_git_reset: modalResult.performGitReset ?? true,
      });

      // Success - exit editing mode
      onCancelled?.();
    } catch (error: unknown) {
      setSendError((error as Error)?.message || 'Failed to send retry');
      setIsSending(false);
    }
  }, [
    canSend,
    executionProcessId,
    attemptId,
    branchStatus,
    attemptData.processes,
    message,
    selectedVariant,
    onCancelled,
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
