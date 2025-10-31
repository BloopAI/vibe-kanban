import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FollowUpEditorCard } from '@/components/tasks/follow-up/FollowUpEditorCard';
import { FollowUpStatusRow } from '@/components/tasks/FollowUpStatusRow';
import { ImageUploadSection } from '@/components/ui/ImageUploadSection';
import { cn } from '@/lib/utils';
import { VariantSelector } from '@/components/tasks/VariantSelector';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Image as ImageIcon, Send, X } from 'lucide-react';
import { useDraftEditor } from '@/hooks/follow-up/useDraftEditor';
import { useDraftStream } from '@/hooks/follow-up/useDraftStream';
import { useDraftAutosave } from '@/hooks/follow-up/useDraftAutosave';
import {
  attemptsApi,
  imagesApi,
  executionProcessesApi,
  commitsApi,
} from '@/lib/api';
import type { DraftResponse, TaskAttempt } from 'shared/types';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useUserSystem } from '@/components/config-provider';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import { showModal } from '@/lib/modals';
import {
  shouldShowInLogs,
  isCodingAgent,
  PROCESS_RUN_REASONS,
} from '@/constants/processes';
import { appendImageMarkdown } from '@/utils/markdownImages';
import type { RestoreLogsDialogResult } from '@/components/dialogs';

export function RetryEditorInline({
  attempt,
  executionProcessId,
  initialVariant,
  onCancelled,
}: {
  attempt: TaskAttempt;
  executionProcessId: string;
  initialVariant: string | null;
  onCancelled?: () => void;
}) {
  const { t } = useTranslation(['common']);
  const attemptId = attempt.id;
  const { retryDraft, isRetryLoaded } = useDraftStream(attemptId);
  const { isAttemptRunning, attemptData } = useAttemptExecution(attemptId);
  const { data: branchStatus } = useBranchStatus(attemptId);
  const { profiles } = useUserSystem();

  // Errors are now reserved for send/cancel; creation occurs outside via useProcessRetry
  const [initError] = useState<string | null>(null);

  const draft = useMemo<DraftResponse | null>(() => {
    if (!retryDraft || retryDraft.retry_process_id !== executionProcessId) {
      return null;
    }
    return {
      ...retryDraft,
      retry_process_id: executionProcessId,
    };
  }, [retryDraft, executionProcessId]);

  const {
    message,
    setMessage,
    images,
    setImages,
    handleImageUploaded,
    clearImagesAndUploads,
    isMessageLocallyDirty,
  } = useDraftEditor({
    draft,
    taskId: attempt.task_id,
  });

  // Presentation-only: show/hide image upload panel
  const [showImageUpload, setShowImageUpload] = useState(false);

  // Variant selection: start with initialVariant or draft.variant
  const [selectedVariant, setSelectedVariant] = useState<string | null>(
    draft?.variant ?? initialVariant ?? null
  );
  useEffect(() => {
    if (draft?.variant !== undefined) setSelectedVariant(draft.variant ?? null);
  }, [draft?.variant]);

  const { isSaving, saveStatus } = useDraftAutosave({
    draftType: 'retry',
    attemptId,
    serverDraft: draft,
    current: {
      prompt: message,
      variant: selectedVariant,
      image_ids: images.map((img) => img.id),
      retry_process_id: executionProcessId,
    },
    isDraftSending: false,
  });

  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  // Show overlay and keep UI disabled while waiting for server to clear retry_draft
  const [isFinalizing, setIsFinalizing] = useState<false | 'cancel' | 'send'>(
    false
  );
  const canSend = !isAttemptRunning && !!(message.trim() || images.length > 0);

  const onCancel = async () => {
    setSendError(null);
    setIsFinalizing('cancel');
    try {
      await attemptsApi.deleteDraft(attemptId, 'retry');
    } catch (error: unknown) {
      setIsFinalizing(false);
      setSendError((error as Error)?.message || 'Failed to cancel retry');
    }
  };

  // Safety net: if server provided a draft but local message is empty, force-apply once
  useEffect(() => {
    if (!isRetryLoaded || !draft) return;
    const serverPrompt = draft.prompt || '';
    if (message === '' && serverPrompt !== '' && !isMessageLocallyDirty()) {
      setMessage(serverPrompt);
      if (import.meta.env.DEV) {
        // One-shot debug to validate hydration ordering in dev
        console.debug('[retry/hydrate] applied server prompt fallback', {
          attemptId,
          processId: executionProcessId,
          len: serverPrompt.length,
        });
      }
    }
  }, [
    attemptId,
    draft,
    executionProcessId,
    isRetryLoaded,
    message,
    setMessage,
    isMessageLocallyDirty,
  ]);

  const onSend = async () => {
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
        modalResult = await showModal<RestoreLogsDialogResult>('restore-logs', {
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

      await attemptsApi.followUp(attemptId, {
        prompt: message,
        variant: selectedVariant,
        image_ids: images.map((img) => img.id),
        retry_process_id: executionProcessId,
        force_when_dirty: modalResult.forceWhenDirty ?? false,
        perform_git_reset: modalResult.performGitReset ?? true,
      });
      clearImagesAndUploads();
      // Keep overlay up until stream clears the retry draft
      setIsFinalizing('send');
    } catch (error: unknown) {
      setSendError((error as Error)?.message || 'Failed to send retry');
      setIsSending(false);
      setIsFinalizing(false);
    }
  };

  // Once server stream clears retry_draft, exit retry mode (both cancel and send)
  useEffect(() => {
    const stillRetrying = !!retryDraft?.retry_process_id;
    if ((isFinalizing || isSending) && !stillRetrying) {
      setIsFinalizing(false);
      setIsSending(false);
      onCancelled?.();
      return;
    }
  }, [
    retryDraft?.retry_process_id,
    isFinalizing,
    isSending,
    onCancelled,
    attemptId,
  ]);

  return (
    <div className="space-y-2">
      {initError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{initError}</AlertDescription>
        </Alert>
      )}

      <FollowUpEditorCard
        placeholder="Edit and resend your message…"
        value={message}
        onChange={setMessage}
        onKeyDown={() => void 0}
        disabled={isSending || !!isFinalizing}
        showLoadingOverlay={isSending || !!isFinalizing}
        textareaClassName="bg-background"
      />

      {/* Draft save/load status (no queue/sending for retry) */}
      <FollowUpStatusRow
        status={{
          save: { state: isSaving ? 'saving' : saveStatus, isSaving },
          draft: { isLoaded: isRetryLoaded, isSending: false },
          queue: { isUnqueuing: false, isQueued: false },
        }}
        pillBgClass="bg-background"
      />

      <div className="flex items-center gap-2">
        {/* Image button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowImageUpload((prev) => !prev)}
          disabled={isSending || !!isFinalizing}
        >
          <ImageIcon
            className={cn(
              'h-4 w-4',
              (images.length > 0 || showImageUpload) && 'text-primary'
            )}
          />
        </Button>
        <VariantSelector
          selectedVariant={selectedVariant}
          onChange={setSelectedVariant}
          currentProfile={profiles?.[attempt.executor] ?? null}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSending || !!isFinalizing}
          >
            <X className="h-3 w-3 mr-1" />{' '}
            {t('buttons.cancel', { ns: 'common' })}
          </Button>
          <Button
            onClick={onSend}
            disabled={!canSend || isSending || !!isFinalizing}
          >
            <Send className="h-3 w-3 mr-1" />{' '}
            {t('buttons.send', { ns: 'common', defaultValue: 'Send' })}
          </Button>
        </div>
      </div>

      {showImageUpload && (
        <div className="mb-2">
          <ImageUploadSection
            images={images}
            onImagesChange={setImages}
            onUpload={(file) => imagesApi.uploadForTask(attempt.task_id, file)}
            onDelete={imagesApi.delete}
            onImageUploaded={(image) => {
              handleImageUploaded(image);
              setMessage((prev) => appendImageMarkdown(prev, image));
            }}
            disabled={isSending || !!isFinalizing}
            collapsible={false}
            defaultExpanded={true}
          />
        </div>
      )}

      {sendError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{sendError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
