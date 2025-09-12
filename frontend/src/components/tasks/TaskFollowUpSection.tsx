import {
  Clock,
  Send,
  ChevronDown,
  ImageIcon,
  StopCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageUploadSection } from '@/components/ui/ImageUploadSection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  attemptsApi,
  imagesApi,
  type UpdateFollowUpDraftRequest,
} from '@/lib/api.ts';
import type {
  ImageResponse,
  TaskWithAttemptStatus,
  FollowUpDraft,
} from 'shared/types';
import { useBranchStatus } from '@/hooks';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { Loader2 } from 'lucide-react';
import { useUserSystem } from '@/components/config-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useVariantCyclingShortcut } from '@/lib/keyboard-shortcuts';
import { useReview } from '@/contexts/ReviewProvider';
import { useJsonPatchStream } from '@/hooks/useJsonPatchStream';
import { inIframe } from '@/vscode/bridge';
import { buildResolveConflictsInstructions } from '@/lib/conflicts';
import type { ConflictOp } from 'shared/types';
import { ConflictBanner } from '@/components/tasks/ConflictBanner';
import { useTransientStatus } from '@/hooks/useTransientStatus';
import { StatusPill } from '@/components/tasks/StatusPill';

interface TaskFollowUpSectionProps {
  task: TaskWithAttemptStatus;
  projectId: string;
  selectedAttemptId?: string;
  selectedAttemptProfile?: string;
  jumpToLogsTab: () => void;
}

export function TaskFollowUpSection({
  task,
  projectId,
  selectedAttemptId,
  selectedAttemptProfile,
  jumpToLogsTab,
}: TaskFollowUpSectionProps) {
  const arraysEqualOrdered = useCallback(
    (a: string[], b: string[]) =>
      a.length === b.length && a.every((id, i) => id === b[i]),
    []
  );
  const {
    attemptData,
    isAttemptRunning,
    stopExecution,
    isStopping,
    processes,
  } = useAttemptExecution(selectedAttemptId, task.id);
  const { data: branchStatus, refetch: refetchBranchStatus } =
    useBranchStatus(selectedAttemptId);
  const [attemptBranch, setAttemptBranch] = useState<string | null>(null);
  const { profiles } = useUserSystem();
  const { comments, generateReviewMarkdown, clearComments } = useReview();

  // Generate review markdown when comments change
  const reviewMarkdown = useMemo(() => {
    return generateReviewMarkdown();
  }, [generateReviewMarkdown, comments]);

  // Inline defaultFollowUpVariant logic
  const defaultFollowUpVariant = useMemo(() => {
    if (!processes.length) return null;

    // Find most recent coding agent process with variant
    const latestProfile = processes
      .filter((p) => p.run_reason === 'codingagent')
      .reverse()
      .map((process) => {
        if (
          process.executor_action?.typ.type === 'CodingAgentInitialRequest' ||
          process.executor_action?.typ.type === 'CodingAgentFollowUpRequest'
        ) {
          return process.executor_action?.typ.executor_profile_id;
        }
        return undefined;
      })
      .find(Boolean);

    if (latestProfile?.variant) {
      return latestProfile.variant;
    } else if (latestProfile) {
      return null;
    } else if (selectedAttemptProfile && profiles) {
      // No processes yet, check if profile has default variant
      const profile = profiles?.[selectedAttemptProfile];
      if (profile && Object.keys(profile).length > 0) {
        return Object.keys(profile)[0];
      }
    }

    return null;
  }, [processes, selectedAttemptProfile, profiles]);

  const [followUpMessage, setFollowUpMessage] = useState('');
  // Track latest local values in refs for unmount flush
  const followUpMessageRef = useRef(followUpMessage);
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(
    defaultFollowUpVariant
  );
  const selectedVariantRef = useRef<string | null>(selectedVariant);
  const [isAnimating, setIsAnimating] = useState(false);
  const variantButtonRef = useRef<HTMLButtonElement>(null);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [images, setImages] = useState<ImageResponse[]>([]);
  const imagesRef = useRef<ImageResponse[]>(images);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [lockedMinHeight, setLockedMinHeight] = useState<number | null>(null);
  // Fade-out overlay for clearing text when sending begins
  const [fadeOverlayText, setFadeOverlayText] = useState('');
  const [showFadeOverlay, setShowFadeOverlay] = useState(false);
  const [overlayFadeClass, setOverlayFadeClass] = useState('');
  const overlayFadeTimerRef = useRef<number | undefined>(undefined);
  const overlayHideTimerRef = useRef<number | undefined>(undefined);
  const [isQueued, setIsQueued] = useState(false);
  const isQueuedRef = useRef<boolean>(isQueued);
  const [isDraftSending, setIsDraftSending] = useState(false);
  const isDraftSendingRef = useRef<boolean>(isDraftSending);
  const [isQueuing, setIsQueuing] = useState(false);
  const [isUnqueuing, setIsUnqueuing] = useState(false);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const {
    saveStatus,
    setSaveStatus,
    isStatusFading,
    scheduleSaved,
    scheduleSent,
    scheduleConflict,
  } = useTransientStatus();
  const lastSentRef = useRef<string>('');
  const suppressNextSaveRef = useRef<boolean>(false);
  const localDirtyRef = useRef<boolean>(false);
  // We auto-resolve conflicts silently by adopting server state.
  const lastServerVersionRef = useRef<number>(-1);
  // Snapshot of latest server values (even if we did not adopt into input)
  const serverPromptRef = useRef<string>('');
  const serverVariantRef = useRef<string | null>(null);
  const serverImageIdsRef = useRef<string[]>([]);
  const prevSendingRef = useRef<boolean>(false);

  // Aliases for status scheduling
  const scheduleSavedStatus = scheduleSaved;

  // Keep refs in sync with latest local values
  useEffect(() => {
    followUpMessageRef.current = followUpMessage;
  }, [followUpMessage]);
  useEffect(() => {
    selectedVariantRef.current = selectedVariant;
  }, [selectedVariant]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => {
    isQueuedRef.current = isQueued;
  }, [isQueued]);
  useEffect(() => {
    isDraftSendingRef.current = isDraftSending;
  }, [isDraftSending]);

  // Helper to immediately flush pending changes (e.g., on unmount) without debounce
  const flushPendingSave = useCallback(async () => {
    if (!selectedAttemptId) return;
    // skip if edits disallowed
    if (isDraftSendingRef.current) return;
    if (isQueuing || isUnqueuing) return;
    if (isQueuedRef.current) return;

    const payload: Partial<UpdateFollowUpDraftRequest> = {};
    // Compare against latest server snapshot
    if (followUpMessageRef.current !== (serverPromptRef.current || '')) {
      payload.prompt = followUpMessageRef.current;
    }
    if (
      (selectedVariantRef.current ?? null) !==
      (serverVariantRef.current ?? null)
    ) {
      payload.variant = (selectedVariantRef.current ?? null) as string | null;
    }
    const currentIds = imagesRef.current.map((img) => img.id);
    const serverIds = serverImageIdsRef.current ?? [];
    if (!arraysEqualOrdered(currentIds, serverIds)) {
      payload.image_ids = currentIds;
    }

    const keys = Object.keys(payload).filter((k) => k !== 'version');
    if (keys.length === 0) return;
    try {
      // Use optimistic concurrency with last known version
      const resp = await attemptsApi.saveFollowUpDraft(selectedAttemptId, {
        ...(payload as any),
        version: lastServerVersionRef.current,
      } as UpdateFollowUpDraftRequest);
      if (resp?.version !== undefined && resp?.version !== null) {
        lastServerVersionRef.current = Number(resp.version ?? 0n);
      }
    } catch {
      // Ignore errors on flush; main flow will reconcile on next mount
    }
  }, [selectedAttemptId, isQueuing, isUnqueuing]);

  const scheduleSentStatus = scheduleSent;

  const scheduleConflictStatus = scheduleConflict;

  // Get the profile from the attempt data
  const selectedProfile = selectedAttemptProfile;

  // Separate logic for when textarea should be disabled vs when send button should be disabled
  const canTypeFollowUp = useMemo(() => {
    if (
      !selectedAttemptId ||
      attemptData.processes.length === 0 ||
      isSendingFollowUp
    ) {
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

    return true;
  }, [
    selectedAttemptId,
    attemptData.processes,
    isSendingFollowUp,
    branchStatus?.merges,
  ]);

  const canSendFollowUp = useMemo(() => {
    if (!canTypeFollowUp) {
      return false;
    }

    // Allow sending if either review comments exist OR follow-up message is present
    return Boolean(reviewMarkdown || followUpMessage.trim());
  }, [canTypeFollowUp, reviewMarkdown, followUpMessage]);
  const currentProfile = useMemo(() => {
    if (!selectedProfile || !profiles) return null;
    return profiles?.[selectedProfile];
  }, [selectedProfile, profiles]);

  // Update selectedVariant when defaultFollowUpVariant changes
  useEffect(() => {
    setSelectedVariant(defaultFollowUpVariant);
  }, [defaultFollowUpVariant]);

  // Subscribe to follow-up draft SSE stream for this attempt
  type DraftStreamState = { follow_up_draft: FollowUpDraft };
  const draftStreamEndpoint = selectedAttemptId
    ? `/api/task-attempts/${selectedAttemptId}/follow-up-draft/stream`
    : undefined;
  const makeInitialDraftData = useCallback(
    (): DraftStreamState => ({
      follow_up_draft: {
        id: '',
        task_attempt_id: selectedAttemptId || '',
        prompt: '',
        queued: false,
        sending: false,
        variant: null,
        image_ids: [],
        // version used only for local comparison; server will patch real value
        version: 0n,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
    [selectedAttemptId]
  );

  const {
    data: draftStream,
    isConnected: draftStreamConnected,
    error: draftStreamError,
  } = useJsonPatchStream<DraftStreamState>(
    draftStreamEndpoint,
    !!draftStreamEndpoint,
    makeInitialDraftData
  );

  // One-shot hydration via REST to avoid waiting on SSE, and to handle environments
  // where SSE connects but initial event is delayed or blocked.
  useEffect(() => {
    let cancelled = false;
    const hydrateOnce = async () => {
      if (!selectedAttemptId) return;
      try {
        const draft = await attemptsApi.getFollowUpDraft(selectedAttemptId);
        if (cancelled) return;
        const incomingVersion = Number((draft as FollowUpDraft).version ?? 0n);
        lastServerVersionRef.current = incomingVersion;
        // Update server snapshot regardless of adoption
        serverPromptRef.current = draft.prompt || '';
        serverVariantRef.current =
          draft.variant !== undefined ? (draft.variant as string | null) : null;
        serverImageIdsRef.current = (draft.image_ids as string[] | null) || [];
        if (!localDirtyRef.current) {
          suppressNextSaveRef.current = true;
          setFollowUpMessage(draft.prompt || '');
        }
        setIsQueued(!!draft.queued);
        if (draft.variant !== undefined && draft.variant !== null)
          setSelectedVariant(draft.variant);
        // Load images if present
        if (draft.image_ids && draft.image_ids.length > 0) {
          const all = await imagesApi.getTaskImages(task.id);
          if (cancelled) return;
          const wantIds = new Set(draft.image_ids);
          setImages(all.filter((img) => wantIds.has(img.id)));
        } else {
          setImages([]);
        }
        if (!isDraftReady) setIsDraftReady(true);
      } catch {
        // ignore, rely on SSE/poll fallback
      }
      // Also fetch attempt branch for UX context
      try {
        const attempt = await attemptsApi.get(selectedAttemptId);
        if (!cancelled) setAttemptBranch(attempt.branch ?? null);
      } catch {
        /* no-op */
      }
    };
    hydrateOnce();
    return () => {
      cancelled = true;
    };
  }, [selectedAttemptId]);

  // Cleanup and flush on unmount
  useEffect(() => {
    return () => {
      void flushPendingSave();
    };
  }, [flushPendingSave]);

  useEffect(() => {
    if (!draftStream) return;
    const d: FollowUpDraft = draftStream.follow_up_draft;
    // Ignore synthetic initial placeholder until real SSE snapshot arrives
    if (d.id === '') {
      return;
    }
    const incomingVersion = Number(d.version ?? 0n);

    // Always reflect queued/sending flags immediately
    setIsQueued(!!d.queued);
    const sendingNow = !!d.sending;
    setIsDraftSending(sendingNow);

    // If server indicates we're sending, ensure the editor is cleared for clarity.
    if (sendingNow) {
      // Edge trigger: show "Follow-up sent" pill once
      if (!prevSendingRef.current) {
        scheduleSentStatus();
      }
      // Show a quick fade-out of the prior content while clearing the actual textarea value
      if (followUpMessage !== '') {
        if (overlayFadeTimerRef.current)
          window.clearTimeout(overlayFadeTimerRef.current);
        if (overlayHideTimerRef.current)
          window.clearTimeout(overlayHideTimerRef.current);
        // Lock container height to avoid jump while autosize recomputes
        if (wrapperRef.current) {
          const h = wrapperRef.current.getBoundingClientRect().height;
          setLockedMinHeight(h);
        }
        setFadeOverlayText(followUpMessage);
        setShowFadeOverlay(true);
        // Start fully visible
        setOverlayFadeClass('opacity-100');
        // Clear textarea immediately under the overlay
        setFollowUpMessage('');
        // Trigger fast fade on next tick (no motion), then remove overlay shortly after
        overlayFadeTimerRef.current = window.setTimeout(
          () => setOverlayFadeClass('opacity-0'),
          20
        );
        overlayHideTimerRef.current = window.setTimeout(() => {
          setShowFadeOverlay(false);
          setFadeOverlayText('');
          setOverlayFadeClass('');
          // Release height lock shortly after fade completes
          setLockedMinHeight(null);
        }, 180);
      }
      if (images.length > 0) setImages([]);
      if (newlyUploadedImageIds.length > 0) setNewlyUploadedImageIds([]);
      if (showImageUpload) setShowImageUpload(false);
    }
    prevSendingRef.current = sendingNow;

    // Update server snapshot refs with latest even if we do not adopt into input
    serverPromptRef.current = d.prompt || '';
    serverVariantRef.current = d.variant ?? null;
    serverImageIdsRef.current = (d.image_ids as string[] | null) || [];

    // Skip if this is a duplicate of what we already processed
    if (incomingVersion === lastServerVersionRef.current) {
      if (!isDraftReady) setIsDraftReady(true);
      return;
    }

    let willAdoptPrompt = false;

    // Initial hydration: avoid clobbering locally typed text with empty server prompt
    if (lastServerVersionRef.current === -1) {
      if (!localDirtyRef.current && !sendingNow) {
        willAdoptPrompt = true;
        setFollowUpMessage(d.prompt || '');
      }
      if (d.variant !== undefined) setSelectedVariant(d.variant);
      lastServerVersionRef.current = incomingVersion;
    }

    // Real server-side change: adopt new prompt/variant
    if (incomingVersion > lastServerVersionRef.current) {
      // If sending, keep the editor clear regardless of server prompt value
      if (sendingNow) {
        willAdoptPrompt = true;
        setFollowUpMessage('');
      } else if (!localDirtyRef.current) {
        willAdoptPrompt = true;
        setFollowUpMessage(d.prompt || '');
      }
      if (d.variant !== undefined) setSelectedVariant(d.variant);
      localDirtyRef.current = false;
      lastServerVersionRef.current = incomingVersion;
    }
    // Mark that next local change shouldn't auto-save only if we actually replaced the input value
    if (willAdoptPrompt) {
      suppressNextSaveRef.current = true;
    }
    if (!d.image_ids || d.image_ids.length === 0) {
      setImages([]);
      setNewlyUploadedImageIds([]);
      setShowImageUpload(false);
    } else {
      // Load attached images for this draft by IDs
      const wantIds = new Set(d.image_ids);
      const haveIds = new Set(images.map((img) => img.id));
      let mismatch = false;
      if (images.length !== wantIds.size) mismatch = true;
      else
        for (const id of wantIds)
          if (!haveIds.has(id)) {
            mismatch = true;
            break;
          }
      if (mismatch) {
        imagesApi
          .getTaskImages(task.id)
          .then((all) => {
            setImages(all.filter((img) => wantIds.has(img.id)));
            setNewlyUploadedImageIds([]);
          })
          .catch(() => void 0);
      }
    }
    if (!isDraftReady) setIsDraftReady(true);
  }, [draftStream]);

  // Cleanup overlay timers
  useEffect(() => {
    return () => {
      if (overlayFadeTimerRef.current)
        window.clearTimeout(overlayFadeTimerRef.current);
      if (overlayHideTimerRef.current)
        window.clearTimeout(overlayHideTimerRef.current);
    };
  }, []);

  // Fallback: if running inside VSCode iframe and SSE isn't connected, poll the draft endpoint to keep UI in sync
  const pollTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!selectedAttemptId) return;
    const shouldPoll =
      inIframe() && (!draftStreamConnected || !!draftStreamError);
    if (!shouldPoll) {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = undefined;
      return;
    }
    const pollOnce = async () => {
      try {
        const draft = await attemptsApi.getFollowUpDraft(selectedAttemptId);
        // Update immediate state, similar to SSE handler
        setIsQueued(!!draft.queued);
        // Polling response does not include 'sending'; preserve previous sending state
        const incomingVersion = Number((draft as FollowUpDraft).version ?? 0n);
        if (incomingVersion !== lastServerVersionRef.current) {
          // Update server snapshot regardless of adoption
          serverPromptRef.current = draft.prompt || '';
          serverVariantRef.current =
            draft.variant !== undefined
              ? (draft.variant as string | null)
              : null;
          serverImageIdsRef.current =
            (draft.image_ids as string[] | null) || [];
          if (!localDirtyRef.current) {
            suppressNextSaveRef.current = true;
            setFollowUpMessage(draft.prompt || '');
          }
          if (draft.variant !== undefined && draft.variant !== null)
            setSelectedVariant(draft.variant);
          lastServerVersionRef.current = incomingVersion;
          // images not included in response type for polling; leave as-is
        }
        if (!isDraftReady) setIsDraftReady(true);
      } catch {
        // ignore
      }
    };
    // Prime once, then interval
    pollOnce();
    pollTimerRef.current = window.setInterval(pollOnce, 1000);
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = undefined;
    };
  }, [selectedAttemptId, draftStreamConnected, draftStreamError]);

  // Debounced persist draft on message or variant change (only while not queued)
  useEffect(() => {
    if (!selectedAttemptId) return;
    // skip saving if currently sending follow-up; it will be cleared on success
    if (isSendingFollowUp) return;
    // also skip while server is sending a queued draft
    if (isDraftSending) return;
    // skip saving while queue/unqueue transitions are in-flight
    if (isQueuing || isUnqueuing) return;
    if (suppressNextSaveRef.current && !localDirtyRef.current) {
      // Skip a single cycle only for programmatic adoption; do not skip real user edits
      suppressNextSaveRef.current = false;
      return;
    }
    // Only save when not queued (edit mode)
    if (isQueued) return;

    const saveDraft = async () => {
      const payload: Partial<UpdateFollowUpDraftRequest> = {};
      // Compare against latest server snapshot refs to avoid depending on SSE readiness
      if (followUpMessage !== (serverPromptRef.current || '')) {
        payload.prompt = followUpMessage;
      }
      // variant change (string | null)
      if ((selectedVariant ?? null) !== (serverVariantRef.current ?? null)) {
        payload.variant = (selectedVariant ?? null) as string | null;
      }
      // images change (compare ids)
      const currentIds = images.map((img) => img.id);
      const serverIds = serverImageIdsRef.current ?? [];
      if (!arraysEqualOrdered(currentIds, serverIds)) {
        payload.image_ids = currentIds;
      }

      // If no field changed, skip network
      const keys = Object.keys(payload).filter((k) => k !== 'version');
      if (keys.length === 0) return;
      const payloadKey = JSON.stringify(payload);
      if (payloadKey === lastSentRef.current) return;
      lastSentRef.current = payloadKey;
      try {
        setIsSaving(true);
        setSaveStatus(navigator.onLine ? 'saving' : 'offline');
        // Include optimistic concurrency version as a number to avoid BigInt serialization issues
        const payloadWithVersion: any = {
          ...payload,
          version: lastServerVersionRef.current,
        };
        const resp = await attemptsApi.saveFollowUpDraft(
          selectedAttemptId,
          payloadWithVersion as UpdateFollowUpDraftRequest
        );
        // Update last known server version from response to ignore the subsequent SSE echo
        if (resp?.version !== undefined && resp?.version !== null) {
          lastServerVersionRef.current = Number(resp.version ?? 0n);
        }
        // Update server snapshot refs from response to reflect acknowledged state
        serverPromptRef.current = resp?.prompt || '';
        serverVariantRef.current = (resp?.variant as string | null) ?? null;
        serverImageIdsRef.current = (resp?.image_ids as string[] | null) || [];
        // Our content is now acknowledged by server
        if ((resp?.prompt ?? '') === followUpMessage) {
          localDirtyRef.current = false;
        }
        // pleasant linger + fade-out
        scheduleSavedStatus();
      } catch (e: unknown) {
        // If conflict (another client edited), adopt server and show notice; otherwise keep offline/idle
        const status =
          e && typeof e === 'object' && 'status' in (e as any)
            ? (e as any).status
            : undefined;
        if (status === 409) {
          try {
            const draft = await attemptsApi.getFollowUpDraft(selectedAttemptId);
            suppressNextSaveRef.current = true;
            setFollowUpMessage(draft.prompt || '');
            setIsQueued(!!draft.queued);
            if (draft.variant !== undefined && draft.variant !== null) {
              setSelectedVariant(draft.variant);
            }
            if (draft.version !== undefined && draft.version !== null) {
              lastServerVersionRef.current = Number(draft.version ?? 0n);
            }
            localDirtyRef.current = false;
            scheduleConflictStatus();
          } catch {
            setSaveStatus(navigator.onLine ? 'idle' : 'offline');
          }
        } else {
          setSaveStatus(navigator.onLine ? 'idle' : 'offline');
        }
      } finally {
        setIsSaving(false);
      }
    };

    // debounce 400ms
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(saveDraft, 400);
    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [
    followUpMessage,
    selectedVariant,
    isQueued,
    selectedAttemptId,
    isSendingFollowUp,
    isQueuing,
    isUnqueuing,
  ]);

  // Remove BroadcastChannel — SSE is authoritative

  // (removed duplicate SSE subscription block)

  const handleImageUploaded = useCallback((image: ImageResponse) => {
    const markdownText = `![${image.original_name}](${image.file_path})`;
    setFollowUpMessage((prev) => {
      if (prev.trim() === '') {
        return markdownText;
      } else {
        return prev + ' ' + markdownText;
      }
    });

    setImages((prev) => [...prev, image]);
    setNewlyUploadedImageIds((prev) => [...prev, image.id]);
  }, []);

  // Use the centralized keyboard shortcut hook for cycling through variants
  useVariantCyclingShortcut({
    currentProfile,
    selectedVariant,
    setSelectedVariant,
    setIsAnimating,
  });

  const onSendFollowUp = async () => {
    if (!task || !selectedAttemptId) return;

    // Combine review markdown and follow-up message
    const extraMessage = followUpMessage.trim();
    const finalPrompt = [reviewMarkdown, extraMessage]
      .filter(Boolean)
      .join('\n\n');

    if (!finalPrompt) return;

    try {
      setIsSendingFollowUp(true);
      setFollowUpError(null);
      // Use newly uploaded image IDs if available, otherwise use all image IDs
      const imageIds =
        newlyUploadedImageIds.length > 0
          ? newlyUploadedImageIds
          : images.length > 0
            ? images.map((img) => img.id)
            : null;

      await attemptsApi.followUp(selectedAttemptId, {
        prompt: finalPrompt,
        variant: selectedVariant,
        image_ids: imageIds,
      });
      setFollowUpMessage('');
      // Clear review comments and reset queue state after successful submission
      clearComments();
      setIsQueued(false);
      // Clear images and newly uploaded IDs after successful submission
      setImages([]);
      setNewlyUploadedImageIds([]);
      setShowImageUpload(false);
      jumpToLogsTab();
      // No need to manually refetch - React Query will handle this
    } catch (error: unknown) {
      // @ts-expect-error it is type ApiError
      setFollowUpError(`Failed to start follow-up execution: ${error.message}`);
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  // Derived UI lock: disallow edits/actions while queued or transitioning
  const isDraftLocked = isQueued || isQueuing || isUnqueuing || isDraftSending;
  const isInputDisabled = isDraftLocked || !isDraftReady;

  // Quick helper to insert a conflict-resolution template into the draft
  const insertResolveConflictsTemplate = useCallback(() => {
    const op: ConflictOp | null = ((): ConflictOp | null => {
      const v = branchStatus?.conflict_op;
      if (
        v === 'rebase' ||
        v === 'merge' ||
        v === 'cherry_pick' ||
        v === 'revert'
      )
        return v;
      return null;
    })();
    const template = buildResolveConflictsInstructions(
      attemptBranch,
      branchStatus?.base_branch_name,
      branchStatus?.conflicted_files || [],
      op
    );
    setFollowUpMessage((prev) => {
      const sep =
        prev.trim().length === 0 ? '' : prev.endsWith('\n') ? '\n' : '\n\n';
      return prev + sep + template;
    });
  }, [
    attemptBranch,
    branchStatus?.base_branch_name,
    branchStatus?.conflicted_files,
    branchStatus?.conflict_op,
  ]);

  // When a process completes (e.g., agent resolved conflicts), refresh branch status promptly
  const prevRunningRef = useRef<boolean>(isAttemptRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isAttemptRunning && selectedAttemptId) {
      refetchBranchStatus();
    }
    prevRunningRef.current = isAttemptRunning;
  }, [isAttemptRunning, selectedAttemptId, refetchBranchStatus]);

  // Queue handler: ensure draft is persisted immediately, then toggle queued
  const onQueue = async () => {
    if (!selectedAttemptId) return;
    if (isQueuing || isQueued) return;
    const hasContent = followUpMessage.trim().length > 0;
    if (!hasContent) return;
    try {
      // Prevent any pending debounced save from racing
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      suppressNextSaveRef.current = true;
      setIsQueuing(true);
      // Optimistically reflect queued state to block edits/buttons immediately
      setIsQueued(true);
      setIsSaving(true);
      setSaveStatus(navigator.onLine ? 'saving' : 'offline');
      // 1) Force-save current draft so the row exists and is up to date (no version to avoid conflicts)
      const immediatePayload: Partial<UpdateFollowUpDraftRequest> = {
        // Do NOT send version here to avoid spurious 409; we'll use the returned version for queueing
        prompt: followUpMessage,
      };
      if (
        (draftStream?.follow_up_draft?.variant ?? null) !==
        (selectedVariant ?? null)
      ) {
        immediatePayload.variant = (selectedVariant ?? null) as string | null;
      }
      const currentIds = images.map((img) => img.id);
      const serverIds =
        (draftStream?.follow_up_draft?.image_ids as string[] | undefined) ?? [];
      const idsEqual =
        currentIds.length === serverIds.length &&
        currentIds.every((id, i) => id === serverIds[i]);
      if (!idsEqual) {
        immediatePayload.image_ids = currentIds;
      }
      await attemptsApi.saveFollowUpDraft(
        selectedAttemptId,
        immediatePayload as UpdateFollowUpDraftRequest
      );

      // 2) Queue with optimistic concurrency using latest version from save
      try {
        const resp = await attemptsApi.setFollowUpQueue(
          selectedAttemptId,
          true,
          undefined,
          lastServerVersionRef.current
        );
        // Immediate local sync to avoid waiting for SSE
        if (resp?.version !== undefined) {
          lastServerVersionRef.current = Number(resp.version ?? 0n);
        }
        setIsQueued(!!resp.queued);
        if (resp.variant !== undefined && resp.variant !== null) {
          setSelectedVariant(resp.variant);
        }
      } catch (err: unknown) {
        // On any error, silently adopt server state
        const latest = await attemptsApi.getFollowUpDraft(selectedAttemptId);
        suppressNextSaveRef.current = true;
        if (latest.version !== undefined && latest.version !== null) {
          lastServerVersionRef.current = Number(latest.version ?? 0n);
        }
        setIsQueued(!!latest.queued);
        if (latest.variant !== undefined && latest.variant !== null) {
          setSelectedVariant(latest.variant);
        }
      }
      // Do not show "Draft saved" for queue; right side shows Queued; a "Follow-up sent" pill will appear when sending starts
      setSaveStatus('idle');
    } catch (e: unknown) {
      // On any error, hard refresh to server truth
      try {
        const draft = await attemptsApi.getFollowUpDraft(selectedAttemptId);
        suppressNextSaveRef.current = true;
        setFollowUpMessage(draft.prompt || '');
        setIsQueued(!!draft.queued);
        if (draft.variant !== undefined && draft.variant !== null) {
          setSelectedVariant(draft.variant);
        }
        if (draft.version !== undefined && draft.version !== null) {
          lastServerVersionRef.current = Number(draft.version ?? 0n);
        }
      } catch {
        /* empty */
      }
      setSaveStatus(navigator.onLine ? 'idle' : 'offline');
    } finally {
      setIsSaving(false);
      setIsQueuing(false);
    }
  };

  // (Removed) auto-unqueue logic — editing is explicit and guarded by a lock now

  return (
    selectedAttemptId && (
      <div className="border-t p-4 focus-within:ring ring-inset">
        <div className="space-y-2">
          {followUpError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{followUpError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            {showImageUpload && (
              <div className="mb-2">
                <ImageUploadSection
                  images={images}
                  onImagesChange={setImages}
                  onUpload={imagesApi.upload}
                  onDelete={imagesApi.delete}
                  onImageUploaded={handleImageUploaded}
                  disabled={!canSendFollowUp || isDraftLocked || !isDraftReady}
                  collapsible={false}
                  defaultExpanded={true}
                />
              </div>
            )}

            {/* Review comments preview */}
            {reviewMarkdown && (
              <div className="text-sm mb-4">
                <div className="whitespace-pre-wrap">{reviewMarkdown}</div>
              </div>
            )}

            {/* Rebase conflict notice and actions */}
            {(branchStatus?.conflicted_files?.length ?? 0) > 0 &&
              isDraftReady && (
                <ConflictBanner
                  attemptBranch={attemptBranch}
                  baseBranch={branchStatus?.base_branch_name}
                  conflictedFiles={branchStatus?.conflicted_files || []}
                  isDraftLocked={isDraftLocked}
                  isDraftReady={isDraftReady}
                  op={
                    branchStatus?.conflict_op === 'rebase' ||
                    branchStatus?.conflict_op === 'merge' ||
                    branchStatus?.conflict_op === 'cherry_pick' ||
                    branchStatus?.conflict_op === 'revert'
                      ? (branchStatus?.conflict_op as ConflictOp)
                      : null
                  }
                  onOpenEditor={async () => {
                    if (!selectedAttemptId) return;
                    try {
                      const first = branchStatus?.conflicted_files?.[0];
                      await attemptsApi.openEditor(
                        selectedAttemptId,
                        undefined,
                        first
                      );
                    } catch (e) {
                      console.error('Failed to open editor', e);
                    }
                  }}
                  onInsertInstructions={insertResolveConflictsTemplate}
                  onAbort={async () => {
                    if (!selectedAttemptId) return;
                    try {
                      await attemptsApi.abortConflicts(selectedAttemptId);
                      refetchBranchStatus();
                    } catch (e) {
                      console.error('Failed to abort conflicts', e);
                      setFollowUpError(
                        'Failed to abort operation. Please try again in your editor.'
                      );
                    }
                  }}
                />
              )}

            <div className="flex flex-col gap-2">
              <div
                ref={wrapperRef}
                className="relative"
                style={
                  lockedMinHeight ? { minHeight: lockedMinHeight } : undefined
                }
              >
                <FileSearchTextarea
                  placeholder={
                    isQueued
                      ? 'Type your follow-up… It will auto-send when ready.'
                      : reviewMarkdown
                        ? '(Optional) Add additional instructions... Type @ to search files.'
                        : 'Continue working on this task attempt... Type @ to search files.'
                  }
                  value={followUpMessage}
                  onChange={(value) => {
                    setFollowUpMessage(value);
                    localDirtyRef.current = true;
                    if (followUpError) setFollowUpError(null);
                  }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (canSendFollowUp && !isSendingFollowUp) {
                        onSendFollowUp();
                      }
                    } else if (e.key === 'Escape') {
                      // Clear input and auto-cancel queue
                      e.preventDefault();
                      setFollowUpMessage('');
                    }
                  }}
                  className={cn(
                    'flex-1 min-h-[40px] resize-none',
                    showFadeOverlay && 'placeholder-transparent'
                  )}
                  // Edits are disallowed while queued or in transition
                  disabled={isInputDisabled}
                  projectId={projectId}
                  rows={1}
                  maxRows={6}
                />
                {showFadeOverlay && fadeOverlayText && (
                  <div
                    className={cn(
                      'pointer-events-none select-none absolute inset-0 px-3 py-2 text-sm whitespace-pre-wrap text-foreground/70 transition-opacity duration-150 ease-out z-10',
                      overlayFadeClass
                    )}
                    aria-hidden
                  >
                    {fadeOverlayText}
                  </div>
                )}
                {(isUnqueuing || !isDraftReady) && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 z-20">
                    <Loader2 className="animate-spin h-4 w-4" />
                  </div>
                )}
              </div>
              {/* Status row: reserved space above action buttons to avoid layout shift */}
              <div className="flex items-center justify-between text-xs min-h-6 h-6 px-0.5">
                {/* Left side: save state or conflicts */}
                <div className="text-muted-foreground">
                  <StatusPill
                    status={saveStatus}
                    fading={isStatusFading}
                    saving={isSaving}
                  />
                </div>
                {/* Right side: queued/sending status */}
                <div className="text-muted-foreground">
                  {isUnqueuing ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted animate-in fade-in-0">
                      <Loader2 className="animate-spin h-3 w-3" /> Unlocking…
                    </span>
                  ) : !isDraftReady ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted animate-in fade-in-0">
                      <Loader2 className="animate-spin h-3 w-3" /> Loading
                      draft…
                    </span>
                  ) : isDraftSending ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted animate-in fade-in-0">
                      <Loader2 className="animate-spin h-3 w-3" /> Sending
                      follow-up…
                    </span>
                  ) : isQueued ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted animate-in fade-in-0">
                      <Clock className="h-3 w-3" /> Queued for next turn. Edits
                      are locked.
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-row items-center">
                <div className="flex-1 flex gap-2">
                  {/* Image button */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowImageUpload(!showImageUpload)}
                    disabled={
                      !canSendFollowUp || isDraftLocked || !isDraftReady
                    }
                  >
                    <ImageIcon
                      className={cn(
                        'h-4 w-4',
                        (images.length > 0 || showImageUpload) && 'text-primary'
                      )}
                    />
                  </Button>

                  {/* Variant selector */}
                  {(() => {
                    const hasVariants =
                      currentProfile && Object.keys(currentProfile).length > 0;

                    if (hasVariants) {
                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              ref={variantButtonRef}
                              variant="secondary"
                              size="sm"
                              className={cn(
                                'w-24 px-2 flex items-center justify-between transition-all',
                                isAnimating && 'scale-105 bg-accent'
                              )}
                              disabled={isDraftLocked || !isDraftReady}
                            >
                              <span className="text-xs truncate flex-1 text-left">
                                {selectedVariant || 'DEFAULT'}
                              </span>
                              <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {Object.entries(currentProfile).map(
                              ([variantLabel]) => (
                                <DropdownMenuItem
                                  key={variantLabel}
                                  onClick={() =>
                                    setSelectedVariant(variantLabel)
                                  }
                                  className={
                                    selectedVariant === variantLabel
                                      ? 'bg-accent'
                                      : ''
                                  }
                                >
                                  {variantLabel}
                                </DropdownMenuItem>
                              )
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    } else if (currentProfile) {
                      // Show disabled button when profile exists but has no variants
                      return (
                        <Button
                          ref={variantButtonRef}
                          variant="outline"
                          size="sm"
                          className="h-10 w-24 px-2 flex items-center justify-between transition-all"
                          disabled
                        >
                          <span className="text-xs truncate flex-1 text-left">
                            Default
                          </span>
                        </Button>
                      );
                    }
                    return null;
                  })()}
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
                        Stop
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
                      >
                        Clear Review Comments
                      </Button>
                    )}
                    <Button
                      onClick={onSendFollowUp}
                      disabled={
                        !canSendFollowUp ||
                        isDraftLocked ||
                        !isDraftReady ||
                        !followUpMessage.trim() ||
                        isSendingFollowUp
                      }
                      size="sm"
                    >
                      {isSendingFollowUp ? (
                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send
                        </>
                      )}
                    </Button>
                    {isQueued && (
                      <Button
                        variant="default"
                        size="sm"
                        className="min-w-[180px] transition-all"
                        onClick={async () => {
                          if (!selectedAttemptId) return;
                          try {
                            if (saveTimeoutRef.current)
                              window.clearTimeout(saveTimeoutRef.current);
                            suppressNextSaveRef.current = true;
                            setIsUnqueuing(true);
                            try {
                              const resp = await attemptsApi.setFollowUpQueue(
                                selectedAttemptId,
                                false,
                                undefined,
                                lastServerVersionRef.current
                              );
                              if (resp?.version !== undefined) {
                                lastServerVersionRef.current = Number(
                                  resp.version ?? 0n
                                );
                              }
                              setIsQueued(!!resp.queued);
                            } catch (err: unknown) {
                              // On any error (including 409), hard refresh and adopt server state
                              const latest =
                                await attemptsApi.getFollowUpDraft(
                                  selectedAttemptId
                                );
                              suppressNextSaveRef.current = true;
                              setFollowUpMessage(latest.prompt || '');
                              setIsQueued(!!latest.queued);
                              if (
                                latest.variant !== undefined &&
                                latest.variant !== null
                              ) {
                                setSelectedVariant(latest.variant);
                              }
                              if (
                                latest.version !== undefined &&
                                latest.version !== null
                              ) {
                                lastServerVersionRef.current = Number(
                                  latest.version ?? 0n
                                );
                              }
                            }
                          } catch (e) {
                            console.error('Failed to unqueue for editing', e);
                          } finally {
                            setIsUnqueuing(false);
                          }
                        }}
                        disabled={isUnqueuing}
                      >
                        {isUnqueuing ? (
                          <>
                            <Loader2 className="animate-spin h-4 w-4 mr-2" />
                            Unqueuing…
                          </>
                        ) : (
                          'Edit'
                        )}
                      </Button>
                    )}
                  </div>
                )}
                {isAttemptRunning && (
                  <div className="ml-2 flex items-center gap-2">
                    <Button
                      onClick={async () => {
                        if (!selectedAttemptId) return;
                        if (isQueued) {
                          try {
                            if (saveTimeoutRef.current)
                              window.clearTimeout(saveTimeoutRef.current);
                            suppressNextSaveRef.current = true;
                            setIsUnqueuing(true);
                            try {
                              const resp = await attemptsApi.setFollowUpQueue(
                                selectedAttemptId,
                                false,
                                undefined,
                                lastServerVersionRef.current
                              );
                              if (resp?.version !== undefined) {
                                lastServerVersionRef.current = Number(
                                  resp.version ?? 0n
                                );
                              }
                              setIsQueued(!!resp.queued);
                            } catch (err: unknown) {
                              // On any error (including 409), hard refresh and adopt server state
                              const latest =
                                await attemptsApi.getFollowUpDraft(
                                  selectedAttemptId
                                );
                              suppressNextSaveRef.current = true;
                              setFollowUpMessage(latest.prompt || '');
                              setIsQueued(!!latest.queued);
                              if (
                                latest.variant !== undefined &&
                                latest.variant !== null
                              ) {
                                setSelectedVariant(latest.variant);
                              }
                              if (
                                latest.version !== undefined &&
                                latest.version !== null
                              ) {
                                lastServerVersionRef.current = Number(
                                  latest.version ?? 0n
                                );
                              }
                            }
                          } catch (e) {
                            console.error('Failed to unqueue for editing', e);
                          } finally {
                            setIsUnqueuing(false);
                          }
                        } else {
                          await onQueue();
                        }
                      }}
                      disabled={
                        isQueued
                          ? isUnqueuing
                          : !canSendFollowUp ||
                            !isDraftReady ||
                            !followUpMessage.trim() ||
                            isQueuing ||
                            isUnqueuing ||
                            isDraftSending
                      }
                      size="sm"
                      variant="default"
                      className="min-w-[180px] transition-all"
                    >
                      {isQueued ? (
                        isUnqueuing ? (
                          <>
                            <Loader2 className="animate-spin h-4 w-4 mr-2" />
                            Unqueuing…
                          </>
                        ) : (
                          'Edit'
                        )
                      ) : isQueuing ? (
                        <>
                          <Loader2 className="animate-spin h-4 w-4 mr-2" />
                          Queuing…
                        </>
                      ) : (
                        'Queue for next turn'
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
