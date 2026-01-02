import { useRef } from 'react';
import {
  PaperclipIcon,
  CheckIcon,
  ClockIcon,
  XIcon,
  PlusIcon,
} from '@phosphor-icons/react';
import type { Session, BaseCodingAgent } from 'shared/types';
import { formatDateShortWithTime } from '@/utils/date';
import { toPrettyCase } from '@/utils/string';
import { AgentIcon } from '@/components/agents/AgentIcon';
import {
  ChatBoxBase,
  VisualVariant,
  type EditorProps,
  type VariantProps,
} from './ChatBoxBase';
import { PrimaryButton } from './PrimaryButton';
import { ToolbarIconButton, ToolbarDropdown } from './Toolbar';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './Dropdown';
import { type ExecutorProps } from './CreateChatBox';

// Re-export shared types
export type { EditorProps, VariantProps } from './ChatBoxBase';

// Status enum - single source of truth for execution state
export type ExecutionStatus =
  | 'idle'
  | 'sending'
  | 'running'
  | 'queued'
  | 'stopping'
  | 'queue-loading'
  | 'feedback'
  | 'edit';

interface ActionsProps {
  onSend: () => void;
  onQueue: () => void;
  onCancelQueue: () => void;
  onStop: () => void;
  onPasteFiles: (files: File[]) => void;
}

interface SessionProps {
  sessions: Session[];
  selectedSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  /** Whether user is creating a new session */
  isNewSessionMode?: boolean;
  /** Callback to start new session mode */
  onNewSession?: () => void;
}

interface StatsProps {
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
}

interface FeedbackModeProps {
  isActive: boolean;
  onSubmitFeedback: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error?: string | null;
  isTimedOut: boolean;
}

interface EditModeProps {
  isActive: boolean;
  onSubmitEdit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

interface SessionChatBoxProps {
  status: ExecutionStatus;
  editor: EditorProps;
  actions: ActionsProps;
  session: SessionProps;
  stats?: StatsProps;
  variant?: VariantProps;
  feedbackMode?: FeedbackModeProps;
  editMode?: EditModeProps;
  error?: string | null;
  projectId?: string;
  agent?: BaseCodingAgent | null;
  /** Executor selection for new session mode */
  executor?: ExecutorProps;
  /** Whether there's a pending approval (suppresses running animation) */
  hasPendingApproval?: boolean;
}

/**
 * Full-featured chat box for session mode.
 * Supports queue, stop, attach, feedback mode, stats, and session switching.
 */
export function SessionChatBox({
  status,
  editor,
  actions,
  session,
  stats,
  variant,
  feedbackMode,
  editMode,
  error,
  projectId,
  agent,
  executor,
  hasPendingApproval,
}: SessionChatBoxProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine if in feedback mode or edit mode
  const isInFeedbackMode = feedbackMode?.isActive ?? false;
  const isInEditMode = editMode?.isActive ?? false;

  // Key to force editor remount when entering feedback/edit mode (triggers auto-focus)
  const focusKey = isInFeedbackMode
    ? 'feedback'
    : isInEditMode
      ? 'edit'
      : 'normal';

  // Derived state from status
  const isDisabled =
    status === 'sending' ||
    status === 'stopping' ||
    feedbackMode?.isSubmitting ||
    editMode?.isSubmitting;
  const canSend =
    editor.value.trim().length > 0 &&
    !['sending', 'stopping', 'queue-loading'].includes(status);
  const isQueued = status === 'queued';
  const isRunning = status === 'running' || status === 'queued';
  const showRunningAnimation =
    (status === 'running' || status === 'queued' || status === 'sending') &&
    !hasPendingApproval &&
    editor.value.trim().length === 0;

  // Placeholder
  const placeholder = isInFeedbackMode
    ? 'Provide feedback for the plan...'
    : isInEditMode
      ? 'Edit your message...'
      : session.isNewSessionMode
        ? 'Start a new conversation...'
        : 'Continue working on this task...';

  // Cmd+Enter handler
  const handleCmdEnter = () => {
    if (isInFeedbackMode && canSend && !feedbackMode?.isTimedOut) {
      feedbackMode?.onSubmitFeedback();
    } else if (isInEditMode && canSend) {
      editMode?.onSubmitEdit();
    } else if (status === 'running' && canSend) {
      actions.onQueue();
    } else if (status === 'idle' && canSend) {
      actions.onSend();
    }
  };

  // File input handlers
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith('image/')
    );
    if (files.length > 0) {
      actions.onPasteFiles(files);
    }
    e.target.value = '';
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  // Session dropdown
  const {
    sessions,
    selectedSessionId,
    onSelectSession,
    isNewSessionMode,
    onNewSession,
  } = session;
  const isLatestSelected =
    sessions.length > 0 && selectedSessionId === sessions[0].id;
  const sessionLabel = isNewSessionMode
    ? 'New Session'
    : isLatestSelected
      ? 'Latest'
      : 'Previous';

  // Stats
  const filesChanged = stats?.filesChanged ?? 0;
  const linesAdded = stats?.linesAdded;
  const linesRemoved = stats?.linesRemoved;

  // Render action buttons based on status
  const renderActionButtons = () => {
    // Feedback mode takes precedence
    if (isInFeedbackMode) {
      if (feedbackMode?.isTimedOut) {
        return (
          <PrimaryButton
            variant="secondary"
            onClick={feedbackMode.onCancel}
            value="Cancel"
          />
        );
      }
      return (
        <>
          <PrimaryButton
            variant="secondary"
            onClick={feedbackMode?.onCancel}
            value="Cancel"
          />
          <PrimaryButton
            onClick={feedbackMode?.onSubmitFeedback}
            disabled={!canSend || feedbackMode?.isSubmitting}
            actionIcon={feedbackMode?.isSubmitting ? 'spinner' : undefined}
            value="Submit Feedback"
          />
        </>
      );
    }

    // Edit mode
    if (isInEditMode) {
      return (
        <>
          <PrimaryButton
            variant="secondary"
            onClick={editMode?.onCancel}
            value="Cancel"
          />
          <PrimaryButton
            onClick={editMode?.onSubmitEdit}
            disabled={!canSend || editMode?.isSubmitting}
            actionIcon={editMode?.isSubmitting ? 'spinner' : undefined}
            value="Retry"
          />
        </>
      );
    }

    switch (status) {
      case 'idle':
        return (
          <PrimaryButton
            onClick={actions.onSend}
            disabled={!canSend}
            value="Send"
          />
        );

      case 'sending':
        return (
          <PrimaryButton
            onClick={actions.onStop}
            actionIcon="spinner"
            value="Sending"
          />
        );

      case 'running':
        return (
          <>
            <PrimaryButton
              onClick={actions.onQueue}
              disabled={!canSend}
              value="Queue"
            />
            <PrimaryButton
              onClick={actions.onStop}
              variant="secondary"
              value="Stop"
              actionIcon="spinner"
            />
          </>
        );

      case 'queued':
        return (
          <>
            <PrimaryButton
              onClick={actions.onCancelQueue}
              value="Cancel Queue"
              actionIcon={XIcon}
            />
            <PrimaryButton
              onClick={actions.onStop}
              variant="secondary"
              value="Stop"
              actionIcon="spinner"
            />
          </>
        );

      case 'stopping':
        return <PrimaryButton disabled value="Stopping" actionIcon="spinner" />;
      case 'queue-loading':
        return <PrimaryButton disabled value="Loading" actionIcon="spinner" />;
      case 'feedback':
      case 'edit':
        return null;
    }
  };

  // Banner content
  const renderBanner = () => {
    if (isQueued) {
      return (
        <div className="bg-secondary border-b px-double py-base flex items-center gap-base">
          <ClockIcon className="h-4 w-4 text-low" />
          <span className="text-sm text-low">
            Message queued - will execute when current run finishes
          </span>
        </div>
      );
    }

    return null;
  };

  // Combine errors
  const displayError = feedbackMode?.error ?? error;

  return (
    <ChatBoxBase
      editor={editor}
      placeholder={placeholder}
      onCmdEnter={handleCmdEnter}
      disabled={isDisabled}
      projectId={projectId}
      autoFocus={true}
      focusKey={focusKey}
      variant={variant}
      error={displayError}
      banner={renderBanner()}
      visualVariant={
        isInFeedbackMode
          ? VisualVariant.FEEDBACK
          : isInEditMode
            ? VisualVariant.EDIT
            : VisualVariant.NORMAL
      }
      isRunning={showRunningAnimation}
      onPasteFiles={actions.onPasteFiles}
      headerLeft={
        <>
          {/* New session mode: agent icon + executor dropdown */}
          {isNewSessionMode && executor && (
            <>
              <AgentIcon agent={agent} className="size-icon-xl" />
              <ToolbarDropdown
                label={
                  executor.selected
                    ? toPrettyCase(executor.selected)
                    : 'Select Executor'
                }
              >
                <DropdownMenuLabel>Executors</DropdownMenuLabel>
                {executor.options.map((exec) => (
                  <DropdownMenuItem
                    key={exec}
                    icon={executor.selected === exec ? CheckIcon : undefined}
                    onClick={() => executor.onChange(exec)}
                  >
                    {toPrettyCase(exec)}
                  </DropdownMenuItem>
                ))}
              </ToolbarDropdown>
            </>
          )}
          {/* Existing session mode: file stats */}
          {!isNewSessionMode && (
            <>
              <span className="text-low">
                {filesChanged} {filesChanged === 1 ? 'File' : 'Files'} changed
              </span>
              {(linesAdded !== undefined || linesRemoved !== undefined) && (
                <span className="space-x-half">
                  {linesAdded !== undefined && (
                    <span className="text-success">+{linesAdded}</span>
                  )}
                  {linesRemoved !== undefined && (
                    <span className="text-error">-{linesRemoved}</span>
                  )}
                </span>
              )}
            </>
          )}
        </>
      }
      headerRight={
        <>
          {/* Agent icon for existing session mode */}
          {!isNewSessionMode && (
            <AgentIcon agent={agent} className="size-icon-xl" />
          )}
          <ToolbarDropdown
            label={sessionLabel}
            disabled={isInFeedbackMode || isInEditMode}
          >
            {/* New Session option */}
            <DropdownMenuItem
              icon={isNewSessionMode ? CheckIcon : PlusIcon}
              onClick={() => onNewSession?.()}
            >
              New Session
            </DropdownMenuItem>
            {sessions.length > 0 && <DropdownMenuSeparator />}
            {sessions.length > 0 ? (
              <>
                <DropdownMenuLabel>Sessions</DropdownMenuLabel>
                {sessions.map((s, index) => (
                  <DropdownMenuItem
                    key={s.id}
                    icon={
                      !isNewSessionMode && s.id === selectedSessionId
                        ? CheckIcon
                        : undefined
                    }
                    onClick={() => onSelectSession(s.id)}
                  >
                    {index === 0
                      ? 'Latest'
                      : formatDateShortWithTime(s.created_at)}
                  </DropdownMenuItem>
                ))}
              </>
            ) : (
              <DropdownMenuItem disabled>No previous sessions</DropdownMenuItem>
            )}
          </ToolbarDropdown>
        </>
      }
      footerLeft={
        <>
          <ToolbarIconButton
            icon={PaperclipIcon}
            aria-label="Attach file"
            onClick={handleAttachClick}
            disabled={isDisabled || isRunning}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
        </>
      }
      footerRight={renderActionButtons()}
    />
  );
}
