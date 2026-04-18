import {
  ImageIcon,
  Loader2,
  Send,
  StopCircle,
  AlertCircle,
  ListPlus,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ImageUploadSection,
  type ImageUploadSectionHandle,
} from '@/components/ui/image-upload-section';
import { Alert, AlertDescription } from '@/components/ui/alert';
//
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { imagesApi, templatesApi } from '@/lib/api';
import { attemptsApi } from '@/lib/api/attempts';
import type { TaskWithAttemptStatus } from 'shared/types';
import {
  useBranchStatus,
  useSessionError,
  useMessageQueueInjection,
} from '@/hooks';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useUserSystem } from '@/components/ConfigProvider';
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
import { SessionErrorBanner } from '@/components/tasks/SessionErrorBanner';
import { FollowUpEditorCard } from '@/components/tasks/follow-up/FollowUpEditorCard';
import { useDraftStream } from '@/hooks/follow-up/useDraftStream';
import { useRetryUi } from '@/contexts/RetryUiContext';
import { useDraftEditor } from '@/hooks/follow-up/useDraftEditor';
import { useDraftAutosave } from '@/hooks/follow-up/useDraftAutosave';
import { useFollowUpSend } from '@/hooks/follow-up/useFollowUpSend';
import { useDefaultVariant } from '@/hooks/follow-up/useDefaultVariant';
import { useAgentRuntimeCapabilities } from '@/hooks/useAgentRuntimeCapabilities';
import { buildResolveConflictsInstructions } from '@/lib/conflicts';
import { insertImageMarkdownAtPosition } from '@/utils/markdownImages';
import { useTranslation } from 'react-i18next';
import {
  TemplatePicker,
  type Template as PickerTemplate,
} from '@/components/tasks/TemplatePicker';
import ModelChangeWarningDialog from '@/components/dialogs/ModelChangeWarningDialog';
import { getStatusCallback } from '@/contexts/TaskOptimisticContext';

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
  const { hasSessionError, invalidate: invalidateSessionError } =
    useSessionError(selectedAttemptId);
  const { profiles } = useUserSystem();

  // Get the ID of the currently running process (for live message injection)
  const runningProcessId = useMemo(() => {
    return processes.find((p) => p.status === 'running')?.id;
  }, [processes]);

  // Message queue for adding messages with live injection support
  // Note: Queue UI is now in MobileConversationLayout via MessageQueueBadge
  const {
    addAndInject,
    isAdding: isAddingToQueue,
    isInjecting,
  } = useMessageQueueInjection(selectedAttemptId, runningProcessId);
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
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const imageUploadRef = useRef<ImageUploadSectionHandle>(null);

  // Template fetching state
  const [customTemplates, setCustomTemplates] = useState<PickerTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // Track insert position for pasted images (sequential insertion)
  const insertPositionRef = useRef<number>(0);

  const handlePasteImages = useCallback(
    (files: File[], cursorPosition: number) => {
      if (files.length === 0) return;
      // Store cursor position for use when images finish uploading
      insertPositionRef.current = cursorPosition;
      setShowImageUpload(true);
      void imageUploadRef.current?.addFiles(files);
    },
    []
  );

  // Track cursor position on selection change (for image button clicks)
  const handleSelectionChange = useCallback((cursorPosition: number) => {
    insertPositionRef.current = cursorPosition;
  }, []);

  // Handle template selection - append template content to message
  const handleTemplateSelect = useCallback(
    (template: PickerTemplate) => {
      setFollowUpMessage((prev) => prev + template.content);
    },
    [setFollowUpMessage]
  );

  // Fetch custom templates when picker opens
  useEffect(() => {
    if (!showTemplatePicker) return;

    let cancelled = false;
    setLoadingTemplates(true);
    setTemplateError(null);

    templatesApi
      .list()
      .then((templates) => {
        if (cancelled) return;
        setCustomTemplates(
          templates.map((tmpl) => ({
            id: tmpl.id,
            name: tmpl.template_name,
            description: `@${tmpl.template_name}`,
            content: tmpl.content,
          }))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load templates:', err);
        setTemplateError(
          t('templatePicker.loadError', 'Failed to load templates')
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingTemplates(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showTemplatePicker, t]);

  // Track whether the follow-up textarea is focused
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  // Model change warning dialog state
  const [pendingVariant, setPendingVariant] = useState<string | null>(null);
  const [showModelWarning, setShowModelWarning] = useState(false);

  // Variant selection (with keyboard cycling)
  const {
    selectedVariant,
    setSelectedVariant,
    currentProfile,
    currentExecutor,
    wouldModelChange,
    previousVariantInfo,
  } = useDefaultVariant({ processes, profiles: profiles ?? null });
  const { data: runtimeCapabilities } =
    useAgentRuntimeCapabilities(currentExecutor);

  // Handle variant change with model change detection
  const handleVariantChange = useCallback(
    (newVariant: string | null) => {
      if (wouldModelChange(newVariant)) {
        setPendingVariant(newVariant);
        setShowModelWarning(true);
      } else {
        setSelectedVariant(newVariant);
      }
    },
    [wouldModelChange, setSelectedVariant]
  );

  // Confirm model change and apply pending variant
  const handleConfirmModelChange = useCallback(() => {
    if (pendingVariant !== null) {
      setSelectedVariant(pendingVariant);
    }
    setPendingVariant(null);
    setShowModelWarning(false);
  }, [pendingVariant, setSelectedVariant]);

  // Extract new model for dialog display
  const newModel = useMemo(() => {
    if (!pendingVariant || !profiles || processes.length === 0) return null;

    // Get the executor from the latest process
    const latestProcess = processes[processes.length - 1];
    if (!latestProcess.executor_action) return null;

    const action = latestProcess.executor_action;
    const actionType = action.typ;
    let executor: string | null = null;

    if (
      actionType.type === 'CodingAgentInitialRequest' ||
      actionType.type === 'CodingAgentFollowUpRequest' ||
      actionType.type === 'CodingAgentReviewRequest'
    ) {
      executor = actionType.executor_profile_id.executor;
    }

    if (!executor) return null;

    const executorConfig = profiles[executor];
    if (!executorConfig) return null;

    const variantKey = pendingVariant ?? 'DEFAULT';
    const variantConfig = executorConfig[variantKey];
    if (!variantConfig) return null;

    const configValue = (variantConfig as Record<string, unknown>)[executor];
    if (!configValue || typeof configValue !== 'object') return null;

    return (configValue as { model?: string | null }).model ?? null;
  }, [pendingVariant, profiles, processes]);

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
    const nextVariantValue = nextVariant === 'DEFAULT' ? null : nextVariant;
    handleVariantChange(nextVariantValue);
  }, [currentProfile, selectedVariant, handleVariantChange]);

  // During retry, follow-up box is greyed/disabled (not hidden)
  // Use RetryUi context so optimistic retry immediately disables this box
  const { activeRetryProcessId } = useRetryUi();
  const isRetryActive = !!activeRetryProcessId;

  // Check if there's a pending approval - users shouldn't be able to type during approvals
  // Only block input if the attempt is still running - if the process failed/crashed,
  // stale pending_approval entries shouldn't block the input forever
  const { entries } = useEntries();
  const hasPendingApproval = useMemo(() => {
    if (!isAttemptRunning) return false;

    return entries.some((entry) => {
      if (entry.type !== 'NORMALIZED_ENTRY') return false;
      const entryType = entry.content.entry_type;
      return (
        entryType.type === 'tool_use' &&
        entryType.status.status === 'pending_approval'
      );
    });
  }, [entries, isAttemptRunning]);

  // Autosave draft when editing
  const { isSaving, saveStatus } = useDraftAutosave({
    attemptId: selectedAttemptId,
    serverDraft: draft,
    current: {
      prompt: followUpMessage,
      variant: selectedVariant,
      image_ids: images.map((img) => img.id),
    },
    isQueuedUI: false,
    isDraftSending: !!draft?.sending,
    isQueuing: false,
    isUnqueuing: false,
  });

  // Send follow-up action
  const { isSendingFollowUp, followUpError, setFollowUpError, onSendFollowUp } =
    useFollowUpSend({
      attemptId: selectedAttemptId,
      taskId: task.id,
      projectId: task.project_id,
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

  const isDraftLocked = !!draft?.sending;
  const isEditable =
    isDraftLoaded && !isDraftLocked && !isRetryActive && !hasPendingApproval;
  const canStartReview = useMemo(() => {
    if (
      !runtimeCapabilities?.supports_review ||
      isAttemptRunning ||
      !isEditable
    ) {
      return false;
    }
    return !Boolean(
      conflictResolutionInstructions ||
        reviewMarkdown ||
        clickedMarkdown ||
        followUpMessage.trim() ||
        images.length > 0
    );
  }, [
    runtimeCapabilities?.supports_review,
    isAttemptRunning,
    isEditable,
    conflictResolutionInstructions,
    reviewMarkdown,
    clickedMarkdown,
    followUpMessage,
    images.length,
  ]);

  // Keyboard shortcut handler - unified submit (add to queue when running, send when idle)
  const handleSubmitShortcut = useCallback(
    async (e?: KeyboardEvent) => {
      e?.preventDefault();

      // When attempt is running, add to message queue (with injection)
      // Note: variant is always null - injected messages use executor's current mode
      if (isAttemptRunning) {
        if (followUpMessage.trim()) {
          await addAndInject(followUpMessage.trim(), null);
          setFollowUpMessage('');
        }
      } else {
        // When attempt is idle, send immediately
        onSendFollowUp();
      }
    },
    [
      isAttemptRunning,
      followUpMessage,
      addAndInject,
      setFollowUpMessage,
      onSendFollowUp,
    ]
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
    when: canSendFollowUp && !isDraftLocked,
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
  ]);

  return (
    selectedAttemptId && (
      <div
        className={cn(
          'grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden focus-within:ring ring-inset',
          isRetryActive && 'opacity-50'
        )}
      >
        {/* Scrollable content area */}
        <div className="overflow-y-auto min-h-0 p-4">
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
                    setFollowUpMessage((prev) => {
                      const { newText, newCursorPosition } =
                        insertImageMarkdownAtPosition(
                          prev,
                          image,
                          insertPositionRef.current
                        );
                      // Advance position for next image (sequential insertion)
                      insertPositionRef.current = newCursorPosition;
                      return newText;
                    });
                  }}
                  disabled={!isEditable}
                  collapsible={false}
                  defaultExpanded={true}
                />
              </div>

              {/* Review comments preview */}
              {reviewMarkdown && (
                <div className="mb-4">
                  <div className="text-sm whitespace-pre-wrap break-words rounded-md border bg-muted p-3">
                    {reviewMarkdown}
                  </div>
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
                  conflictResolutionInstructions={
                    conflictResolutionInstructions
                  }
                />
              )}

              {/* Clicked elements notice and actions */}
              <ClickedElementsBanner />

              {/* Session error banner (corrupted Claude Code sessions) */}
              {hasSessionError && selectedAttemptId && (
                <SessionErrorBanner
                  attemptId={selectedAttemptId}
                  onFixed={invalidateSessionError}
                />
              )}

              <div className="flex flex-col gap-2">
                <FollowUpEditorCard
                  placeholder={
                    reviewMarkdown || conflictResolutionInstructions
                      ? '(Optional) Add additional instructions... Type @ to insert tags or search files.'
                      : 'Continue working on this task attempt... Type @ to insert tags or search files.'
                  }
                  value={followUpMessage}
                  onChange={(value) => {
                    setFollowUpMessage(value);
                    if (followUpError) setFollowUpError(null);
                  }}
                  disabled={!isEditable}
                  showLoadingOverlay={!isDraftLoaded}
                  onPasteFiles={handlePasteImages}
                  onFocusChange={setIsTextareaFocused}
                  onSelectionChange={handleSelectionChange}
                />
                <FollowUpStatusRow
                  status={{
                    save: { state: saveStatus, isSaving },
                    draft: {
                      isLoaded: isDraftLoaded,
                      isSending: !!draft?.sending,
                    },
                    queue: {
                      isUnqueuing: false,
                      isQueued: false,
                    },
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Always-visible action bar */}
        <div className="border-t bg-background p-4">
          <div className="flex flex-row gap-2 items-center">
            {/* Left side: Image + Template buttons */}
            <div className="flex gap-2">
              {/* Image button */}
              <Button
                variant={
                  images.length > 0 || showImageUpload ? 'default' : 'secondary'
                }
                size="sm"
                onClick={() => setShowImageUpload(!showImageUpload)}
                disabled={!isEditable}
              >
                <ImageIcon className="h-4 w-4" />
              </Button>

              {/* Template button */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowTemplatePicker(true)}
                disabled={!isEditable}
              >
                <FileText className="h-4 w-4" />
              </Button>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Right side: Variant (when idle) + Action buttons */}
            <div className="flex items-center gap-2">
              {!isAttemptRunning && (
                <VariantSelector
                  currentProfile={currentProfile}
                  selectedVariant={selectedVariant}
                  onChange={handleVariantChange}
                  disabled={!isEditable}
                />
              )}

              {isAttemptRunning ? (
                <>
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
                        {runtimeCapabilities?.supports_interrupt
                          ? 'Interrupt'
                          : t('followUp.stop')}
                      </>
                    )}
                  </Button>
                  {/* Add to Message Queue button (with live injection when running) */}
                  {/* Note: variant is always null - injected messages use executor's current mode */}
                  <Button
                    onClick={async () => {
                      if (followUpMessage.trim()) {
                        await addAndInject(followUpMessage.trim(), null);
                        setFollowUpMessage('');
                      }
                    }}
                    disabled={
                      !followUpMessage.trim() ||
                      isAddingToQueue ||
                      isInjecting ||
                      !isDraftLoaded ||
                      isRetryActive
                    }
                    size="sm"
                    title={t('messageQueue.addToQueueTooltip')}
                  >
                    {isAddingToQueue || isInjecting ? (
                      <>
                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">
                          {t('messageQueue.queueing')}
                        </span>
                      </>
                    ) : (
                      <>
                        <ListPlus className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">
                          {t('messageQueue.queue')}
                        </span>
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
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
                  {runtimeCapabilities?.supports_review && (
                    <Button
                      onClick={async () => {
                        if (!selectedAttemptId) return;
                        try {
                          setFollowUpError(null);
                          await attemptsApi.review(selectedAttemptId, {
                            variant: selectedVariant,
                            target: undefined,
                          });
                          const updateStatus = getStatusCallback(
                            task.project_id
                          );
                          updateStatus?.(task.id, 'inprogress');
                          jumpToLogsTab();
                        } catch (error: unknown) {
                          const err = error as { message?: string };
                          setFollowUpError(
                            `Failed to start review execution: ${err.message ?? 'Unknown error'}`
                          );
                        }
                      }}
                      disabled={!canStartReview || isSendingFollowUp}
                      size="sm"
                      variant="secondary"
                      title={
                        canStartReview
                          ? 'Review current changes against the target branch with Codex.'
                          : 'Clear follow-up draft inputs before starting a review run.'
                      }
                    >
                      Review with Codex
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
                </>
              )}
            </div>
          </div>
        </div>

        {/* Template Picker */}
        <TemplatePicker
          open={showTemplatePicker}
          onOpenChange={setShowTemplatePicker}
          onSelect={handleTemplateSelect}
          customTemplates={customTemplates}
          showDefaults={true}
          loading={loadingTemplates}
          error={templateError}
        />

        {/* Model Change Warning Dialog */}
        <ModelChangeWarningDialog
          open={showModelWarning}
          onOpenChange={setShowModelWarning}
          previousVariant={previousVariantInfo.variant}
          previousModel={previousVariantInfo.model}
          newVariant={pendingVariant ?? 'DEFAULT'}
          newModel={newModel}
          onConfirm={handleConfirmModelChange}
        />
      </div>
    )
  );
}
