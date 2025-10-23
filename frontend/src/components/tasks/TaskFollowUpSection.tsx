import {
  ImageIcon,
  Loader2,
  Send,
  StopCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ImageUploadSection,
  type ImageUploadSectionHandle,
} from '@/components/ui/ImageUploadSection';
import { Alert, AlertDescription } from '@/components/ui/alert';
//
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { imagesApi } from '@/lib/api.ts';
import type { TaskWithAttemptStatus } from 'shared/types';
import { useBranchStatus } from '@/hooks';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useUserSystem } from '@/components/config-provider';
import { cn } from '@/lib/utils';
//
import { useReview } from '@/contexts/ReviewProvider';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';
import { useEntries } from '@/contexts/EntriesContext';
import { useKeyCycleVariant, useKeySubmitFollowUp, Scope } from '@/keyboard';
import { useHotkeysContext } from 'react-hotkeys-hook';
//
import { VariantSelector } from '@/components/tasks/VariantSelector';
import { FollowUpStatusRow } from '@/components/tasks/FollowUpStatusRow';
import { useAttemptBranch } from '@/hooks/useAttemptBranch';
import { FollowUpConflictSection } from '@/components/tasks/follow-up/FollowUpConflictSection';
import { ClickedElementsBanner } from '@/components/tasks/ClickedElementsBanner';
import { FollowUpEditorCard } from '@/components/tasks/follow-up/FollowUpEditorCard';
import { useDraftStream } from '@/hooks/follow-up/useDraftStream';
import { useRetryUi } from '@/contexts/RetryUiContext';
import { useDraftEditor } from '@/hooks/follow-up/useDraftEditor';
import { useDraftAutosave } from '@/hooks/follow-up/useDraftAutosave';
import { useDraftQueue } from '@/hooks/follow-up/useDraftQueue';
import { useFollowUpSend } from '@/hooks/follow-up/useFollowUpSend';
import { useDefaultVariant } from '@/hooks/follow-up/useDefaultVariant';
import { buildResolveConflictsInstructions } from '@/lib/conflicts';
import { appendImageMarkdown } from '@/utils/markdownImages';
import { useTranslation } from 'react-i18next';

interface TaskFollowUpSectionProps {
  task: TaskWithAttemptStatus;
  selectedAttemptId?: string;
  jumpToLogsTab: () => void;
}

export function TaskFollowUpSection({
  task,
  selectedAttemptId,
  jumpToLogsTab,
}: TaskFollowUpSectionProps) {
  const { t } = useTranslation('tasks');

  const { isAttemptRunning, stopExecution, isStopping, processes } =
    useAttemptExecution(selectedAttemptId, task.id);
  const { data: branchStatus, refetch: refetchBranchStatus } =
    useBranchStatus(selectedAttemptId);
  const { branch: attemptBranch, refetch: refetchAttemptBranch } =
    useAttemptBranch(selectedAttemptId);
  const { profiles } = useUserSystem();
  const { comments, generateReviewMarkdown, clearComments } = useReview();
  const {
    generateMarkdown: generateClickedMarkdown,
    clearElements: clearClickedElements,
  } = useClickedElements();
  const { enableScope, disableScope } = useHotkeysContext();

  const reviewMarkdown = useMemo(
    () => generateReviewMarkdown(),
    [generateReviewMarkdown]
  );

  const clickedMarkdown = useMemo(
    () => generateClickedMarkdown(),
    [generateClickedMarkdown]
  );

  // Non-editable conflict resolution instructions (derived, like review comments)
  const conflictResolutionInstructions = useMemo(() => {
    const hasConflicts = (branchStatus?.conflicted_files?.length ?? 0) > 0;
    if (!hasConflicts) return null;
    return buildResolveConflictsInstructions(
      attemptBranch,
      branchStatus?.target_branch_name,
      branchStatus?.conflicted_files || [],
      branchStatus?.conflict_op ?? null
    );
  }, [
    attemptBranch,
    branchStatus?.target_branch_name,
    branchStatus?.conflicted_files,
    branchStatus?.conflict_op,
  ]);

  // Draft stream and synchronization
  const { draft, isDraftLoaded } = useDraftStream(selectedAttemptId);

  // Editor state
  const {
    message: followUpMessage,
    setMessage: setFollowUpMessage,
    images,
    setImages,
    newlyUploadedImageIds,
    handleImageUploaded,
    clearImagesAndUploads,
  } = useDraftEditor({
    draft,
    taskId: task.id,
  });

  // Presentation-only: show/hide image upload panel
  const [showImageUpload, setShowImageUpload] = useState(false);
  const imageUploadRef = useRef<ImageUploadSectionHandle>(null);

  const handlePasteImages = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setShowImageUpload(true);
    void imageUploadRef.current?.addFiles(files);
  }, []);

  // Track whether the follow-up textarea is focused
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  // Variant selection (with keyboard cycling)
  const { selectedVariant, setSelectedVariant, currentProfile } =
    useDefaultVariant({ processes, profiles: profiles ?? null });

  // Cycle to the next variant when Shift+Tab is pressed
  const cycleVariant = useCallback(() => {
    if (!currentProfile) return;
    const variants = Object.keys(currentProfile); // Include DEFAULT
    if (variants.length === 0) return;

    // Treat null as "DEFAULT" for finding current position
    const currentVariantForLookup = selectedVariant ?? 'DEFAULT';
    const currentIndex = variants.indexOf(currentVariantForLookup);
    const nextIndex = (currentIndex + 1) % variants.length;
    const nextVariant = variants[nextIndex];

    // Keep using null to represent DEFAULT (backend expects it)
    // But for display/cycling purposes, treat DEFAULT as a real option
    setSelectedVariant(nextVariant === 'DEFAULT' ? null : nextVariant);
  }, [currentProfile, selectedVariant, setSelectedVariant]);

  // Queue management (including derived lock flag)
  const { onQueue, onUnqueue } = useDraftQueue({
    attemptId: selectedAttemptId,
    draft,
    message: followUpMessage,
    selectedVariant,
    images,
  });

  // Presentation-only queue state
  const [isQueuing, setIsQueuing] = useState(false);
  const [isUnqueuing, setIsUnqueuing] = useState(false);
  // Local queued state override after server action completes; null = rely on server
  const [queuedOptimistic, setQueuedOptimistic] = useState<boolean | null>(
    null
  );

  // Server + presentation derived flags (computed early so they are usable below)
  const isQueued = !!draft?.queued;
  const displayQueued = queuedOptimistic ?? isQueued;

  // During retry, follow-up box is greyed/disabled (not hidden)
  // Use RetryUi context so optimistic retry immediately disables this box
  const { activeRetryProcessId } = useRetryUi();
  const isRetryActive = !!activeRetryProcessId;

  // Check if there's a pending approval - users shouldn't be able to type during approvals
  const { entries } = useEntries();
  const hasPendingApproval = useMemo(() => {
    return entries.some((entry) => {
      if (entry.type !== 'NORMALIZED_ENTRY') return false;
      const entryType = entry.content.entry_type;
      return (
        entryType.type === 'tool_use' &&
        entryType.status.status === 'pending_approval'
      );
    });
  }, [entries]);

  // Autosave draft when editing
  const { isSaving, saveStatus } = useDraftAutosave({
    attemptId: selectedAttemptId,
    serverDraft: draft,
    current: {
      prompt: followUpMessage,
      variant: selectedVariant,
      image_ids: images.map((img) => img.id),
    },
    isQueuedUI: displayQueued,
    isDraftSending: !!draft?.sending,
    isQueuing: isQueuing,
    isUnqueuing: isUnqueuing,
  });

  // Send follow-up action
  const { isSendingFollowUp, followUpError, setFollowUpError, onSendFollowUp } =
    useFollowUpSend({
      attemptId: selectedAttemptId,
      message: followUpMessage,
      conflictMarkdown: conflictResolutionInstructions,
      reviewMarkdown,
      clickedMarkdown,
      selectedVariant,
      images,
      newlyUploadedImageIds,
      clearComments,
      clearClickedElements,
      jumpToLogsTab,
      onAfterSendCleanup: clearImagesAndUploads,
      setMessage: setFollowUpMessage,
    });

  // Profile/variant derived from processes only (see useDefaultVariant)

  // Separate logic for when textarea should be disabled vs when send button should be disabled
  const canTypeFollowUp = useMemo(() => {
    if (!selectedAttemptId || processes.length === 0 || isSendingFollowUp) {
      return false;
    }

    // Check if PR is merged - if so, block follow-ups
    if (branchStatus?.merges) {
      const mergedPR = branchStatus.merges.find(
        (m) => m.type === 'pr' && m.pr_info.status === 'merged'
      );
      if (mergedPR) {
        return false;
      }
    }

    if (isRetryActive) return false; // disable typing while retry editor is active
    if (hasPendingApproval) return false; // disable typing during approval
    return true;
  }, [
    selectedAttemptId,
    processes.length,
    isSendingFollowUp,
    branchStatus?.merges,
    isRetryActive,
    hasPendingApproval,
  ]);

  const canSendFollowUp = useMemo(() => {
    if (!canTypeFollowUp) {
      return false;
    }

    // Allow sending if conflict instructions, review comments, clicked elements, or message is present
    return Boolean(
      conflictResolutionInstructions ||
        reviewMarkdown ||
        clickedMarkdown ||
        followUpMessage.trim()
    );
  }, [
    canTypeFollowUp,
    conflictResolutionInstructions,
    reviewMarkdown,
    clickedMarkdown,
    followUpMessage,
  ]);
  // currentProfile is provided by useDefaultVariant

  const isDraftLocked =
    displayQueued || isQueuing || isUnqueuing || !!draft?.sending;
  const isEditable =
    isDraftLoaded && !isDraftLocked && !isRetryActive && !hasPendingApproval;

  // Keyboard shortcut handler - unified submit (send or queue depending on state)
  const handleSubmitShortcut = useCallback(
    async (e?: KeyboardEvent) => {
      e?.preventDefault();

      // When attempt is running, queue or unqueue
      if (isAttemptRunning) {
        if (displayQueued) {
          setIsUnqueuing(true);
          try {
            const ok = await onUnqueue();
            if (ok) setQueuedOptimistic(false);
          } finally {
            setIsUnqueuing(false);
          }
        } else {
          setIsQueuing(true);
          try {
            const ok = await onQueue();
            if (ok) setQueuedOptimistic(true);
          } finally {
            setIsQueuing(false);
          }
        }
      } else {
        // When attempt is idle, send immediately
        onSendFollowUp();
      }
    },
    [isAttemptRunning, displayQueued, onQueue, onUnqueue, onSendFollowUp]
  );

  // Register keyboard shortcuts
  useKeyCycleVariant(cycleVariant, {
    scope: Scope.FOLLOW_UP,
    enableOnFormTags: ['textarea', 'TEXTAREA'],
    preventDefault: true,
  });

  useKeySubmitFollowUp(handleSubmitShortcut, {
    scope: Scope.FOLLOW_UP_READY,
    enableOnFormTags: ['textarea', 'TEXTAREA'],
    when: canSendFollowUp && !isDraftLocked && !isQueuing && !isUnqueuing,
  });

  // Enable FOLLOW_UP scope when textarea is focused AND editable
  useEffect(() => {
    if (isEditable && isTextareaFocused) {
      enableScope(Scope.FOLLOW_UP);
    } else {
      disableScope(Scope.FOLLOW_UP);
    }
    return () => {
      disableScope(Scope.FOLLOW_UP);
    };
  }, [isEditable, isTextareaFocused, enableScope, disableScope]);

  // Enable FOLLOW_UP_READY scope when ready to send/queue
  useEffect(() => {
    const isReady =
      isTextareaFocused &&
      isEditable &&
      isDraftLoaded &&
      !isSendingFollowUp &&
      !isRetryActive;

    if (isReady) {
      enableScope(Scope.FOLLOW_UP_READY);
    } else {
      disableScope(Scope.FOLLOW_UP_READY);
    }
    return () => {
      disableScope(Scope.FOLLOW_UP_READY);
    };
  }, [
    isTextareaFocused,
    isEditable,
    isDraftLoaded,
    isSendingFollowUp,
    isRetryActive,
    enableScope,
    disableScope,
  ]);

  // When a process completes (e.g., agent resolved conflicts), refresh branch status promptly
  const prevRunningRef = useRef<boolean>(isAttemptRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isAttemptRunning && selectedAttemptId) {
      refetchBranchStatus();
      refetchAttemptBranch();
    }
    prevRunningRef.current = isAttemptRunning;
  }, [
    isAttemptRunning,
    selectedAttemptId,
    refetchBranchStatus,
    refetchAttemptBranch,
  ]);

  // When server indicates sending started, clear draft and images; hide upload panel
  const prevSendingRef = useRef<boolean>(!!draft?.sending);
  useEffect(() => {
    const now = !!draft?.sending;
    if (now && !prevSendingRef.current) {
      if (followUpMessage !== '') setFollowUpMessage('');
      if (images.length > 0 || newlyUploadedImageIds.length > 0) {
        clearImagesAndUploads();
      }
      if (showImageUpload) setShowImageUpload(false);
      if (queuedOptimistic !== null) setQueuedOptimistic(null);
    }
    prevSendingRef.current = now;
  }, [
    draft?.sending,
    followUpMessage,
    setFollowUpMessage,
    images.length,
    newlyUploadedImageIds.length,
    clearImagesAndUploads,
    showImageUpload,
    queuedOptimistic,
  ]);

  // On server queued state change, drop optimistic override and stop spinners accordingly
  useEffect(() => {
    setQueuedOptimistic(null);
    if (isQueued) {
      if (isQueuing) setIsQueuing(false);
    } else {
      if (isUnqueuing) setIsUnqueuing(false);
    }
  }, [isQueued, isQueuing, isUnqueuing]);

  return (
    selectedAttemptId && (
      <div
        className={cn(
          'p-4 focus-within:ring ring-inset',
          isRetryActive && 'opacity-50'
        )}
      >
        <div className="space-y-2">
          {followUpError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{followUpError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <div
              className={cn(
                'mb-2',
                !showImageUpload && images.length === 0 && 'hidden'
              )}
            >
              <ImageUploadSection
                ref={imageUploadRef}
                images={images}
                onImagesChange={setImages}
                onUpload={(file) => imagesApi.uploadForTask(task.id, file)}
                onDelete={imagesApi.delete}
                onImageUploaded={(image) => {
                  handleImageUploaded(image);
                  setFollowUpMessage((prev) =>
                    appendImageMarkdown(prev, image)
                  );
                }}
                disabled={!isEditable}
                collapsible={false}
                defaultExpanded={true}
              />
            </div>

            {/* Review comments preview */}
            {reviewMarkdown && (
              <div className="text-sm mb-4">
                <div className="whitespace-pre-wrap">{reviewMarkdown}</div>
              </div>
            )}

            {/* Conflict notice and actions (optional UI) */}
            {branchStatus && (
              <FollowUpConflictSection
                selectedAttemptId={selectedAttemptId}
                attemptBranch={attemptBranch}
                branchStatus={branchStatus}
                isEditable={isEditable}
                onResolve={onSendFollowUp}
                enableResolve={
                  canSendFollowUp && !isAttemptRunning && isEditable
                }
                enableAbort={canSendFollowUp && !isAttemptRunning}
                conflictResolutionInstructions={conflictResolutionInstructions}
              />
            )}

            {/* Clicked elements notice and actions */}
            <ClickedElementsBanner />

            <div className="flex flex-col gap-2">
              <FollowUpEditorCard
                placeholder={
                  isQueued
                    ? 'Type your follow-up… It will auto-send when ready.'
                    : reviewMarkdown || conflictResolutionInstructions
                      ? '(Optional) Add additional instructions... Type @ to insert tags or search files.'
                      : 'Continue working on this task attempt... Type @ to insert tags or search files.'
                }
                value={followUpMessage}
                onChange={(value) => {
                  setFollowUpMessage(value);
                  if (followUpError) setFollowUpError(null);
                }}
                disabled={!isEditable}
                showLoadingOverlay={isUnqueuing || !isDraftLoaded}
                onPasteFiles={handlePasteImages}
                onFocusChange={setIsTextareaFocused}
              />
              <FollowUpStatusRow
                status={{
                  save: { state: saveStatus, isSaving },
                  draft: {
                    isLoaded: isDraftLoaded,
                    isSending: !!draft?.sending,
                  },
                  queue: { isUnqueuing: isUnqueuing, isQueued: displayQueued },
                }}
              />
              <div className="flex flex-row gap-2 items-center">
                <div className="flex-1 flex gap-2">
                  {/* Image button */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowImageUpload(!showImageUpload)}
                    disabled={!isEditable}
                  >
                    <ImageIcon
                      className={cn(
                        'h-4 w-4',
                        (images.length > 0 || showImageUpload) && 'text-primary'
                      )}
                    />
                  </Button>

                  <VariantSelector
                    currentProfile={currentProfile}
                    selectedVariant={selectedVariant}
                    onChange={setSelectedVariant}
                    disabled={!isEditable}
                  />
                </div>

                {isAttemptRunning ? (
                  <Button
                    onClick={stopExecution}
                    disabled={isStopping}
                    size="sm"
                    variant="destructive"
                  >
                    {isStopping ? (
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    ) : (
                      <>
                        <StopCircle className="h-4 w-4 mr-2" />
                        {t('followUp.stop')}
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    {comments.length > 0 && (
                      <Button
                        onClick={clearComments}
                        size="sm"
                        variant="destructive"
                        disabled={!isEditable}
                      >
                        {t('followUp.clearReviewComments')}
                      </Button>
                    )}
                    <Button
                      onClick={onSendFollowUp}
                      disabled={
                        !canSendFollowUp ||
                        isDraftLocked ||
                        !isDraftLoaded ||
                        isSendingFollowUp ||
                        isRetryActive
                      }
                      size="sm"
                    >
                      {isSendingFollowUp ? (
                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          {conflictResolutionInstructions
                            ? t('followUp.resolveConflicts')
                            : t('followUp.send')}
                        </>
                      )}
                    </Button>
                    {isQueued && (
                      <Button
                        variant="default"
                        size="sm"
                        className="min-w-[180px] transition-all"
                        onClick={async () => {
                          setIsUnqueuing(true);
                          try {
                            const ok = await onUnqueue();
                            if (ok) setQueuedOptimistic(false);
                          } finally {
                            setIsUnqueuing(false);
                          }
                        }}
                        disabled={isUnqueuing}
                      >
                        {isUnqueuing ? (
                          <>
                            <Loader2 className="animate-spin h-4 w-4 mr-2" />
                            {t('followUp.unqueuing')}
                          </>
                        ) : (
                          t('followUp.edit')
                        )}
                      </Button>
                    )}
                  </div>
                )}
                {isAttemptRunning && (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={async () => {
                        if (displayQueued) {
                          setIsUnqueuing(true);
                          try {
                            const ok = await onUnqueue();
                            if (ok) setQueuedOptimistic(false);
                          } finally {
                            setIsUnqueuing(false);
                          }
                        } else {
                          setIsQueuing(true);
                          try {
                            const ok = await onQueue();
                            if (ok) setQueuedOptimistic(true);
                          } finally {
                            setIsQueuing(false);
                          }
                        }
                      }}
                      disabled={
                        displayQueued
                          ? isUnqueuing
                          : !canSendFollowUp ||
                            !isDraftLoaded ||
                            isQueuing ||
                            isUnqueuing ||
                            !!draft?.sending ||
                            isRetryActive
                      }
                      size="sm"
                      variant="default"
                      className="md:min-w-[180px] transition-all"
                    >
                      {displayQueued ? (
                        isUnqueuing ? (
                          <>
                            <Loader2 className="animate-spin h-4 w-4 mr-2" />
                            {t('followUp.unqueuing')}
                          </>
                        ) : (
                          t('followUp.edit')
                        )
                      ) : isQueuing ? (
                        <>
                          <Loader2 className="animate-spin h-4 w-4 mr-2" />
                          {t('followUp.queuing')}
                        </>
                      ) : (
                        t('followUp.queueForNextTurn')
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  );
}
