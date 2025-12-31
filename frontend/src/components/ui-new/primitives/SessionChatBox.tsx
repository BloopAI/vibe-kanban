import { useRef } from 'react';
import {
  PaperclipIcon,
  CheckIcon,
  ClockIcon,
  XIcon,
  PaperPlaneTiltIcon,
  ArrowClockwiseIcon,
} from '@phosphor-icons/react';
import type { Session, BaseCodingAgent } from 'shared/types';
import { formatDateShortWithTime } from '@/utils/date';
import {
  ChatBoxBase,
  type EditorProps,
  type VariantProps,
} from './ChatBoxBase';
import { PrimaryButton } from './PrimaryButton';
import { ToolbarIconButton, ToolbarDropdown } from './Toolbar';
import { DropdownMenuItem, DropdownMenuLabel } from './Dropdown';

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
  | 'feedback';

interface ActionsProps {
  onSend: () => void;
  onQueue: () => void;
  onCancelQueue: () => void;
  onStop: () => void;
  onAttach: () => void;
}

interface SessionProps {
  sessions: Session[];
  selectedSessionId?: string;
  onSelectSession: (sessionId: string) => void;
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

interface SessionChatBoxProps {
  status: ExecutionStatus;
  editor: EditorProps;
  actions: ActionsProps;
  session: SessionProps;
  stats?: StatsProps;
  variant?: VariantProps;
  feedbackMode?: FeedbackModeProps;
  error?: string | null;
  projectId?: string;
  agent?: BaseCodingAgent | null;
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
  error,
  projectId,
  agent,
}: SessionChatBoxProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine if in feedback mode
  const isInFeedbackMode = feedbackMode?.isActive ?? false;

  // Derived state from status
  const isDisabled =
    status === 'sending' || status === 'stopping' || feedbackMode?.isSubmitting;
  const canSend =
    editor.value.trim().length > 0 &&
    !['sending', 'stopping', 'queue-loading'].includes(status);
  const isQueued = status === 'queued';
  const isRunning = status === 'running' || status === 'queued';

  // Placeholder
  const placeholder = isInFeedbackMode
    ? 'Provide feedback for the plan...'
    : 'Continue working on this task...';

  // Cmd+Enter handler
  const handleCmdEnter = () => {
    if (isInFeedbackMode && canSend && !feedbackMode?.isTimedOut) {
      feedbackMode?.onSubmitFeedback();
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
      actions.onAttach();
    }
    e.target.value = '';
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  // Session dropdown
  const { sessions, selectedSessionId, onSelectSession } = session;
  const isLatestSelected =
    sessions.length > 0 && selectedSessionId === sessions[0].id;
  const sessionLabel = isLatestSelected ? 'Latest' : 'Previous';

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
            actionIcon={
              feedbackMode?.isSubmitting ? 'spinner' : PaperPlaneTiltIcon
            }
            value="Submit Feedback"
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
            actionIcon={PaperPlaneTiltIcon}
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
              actionIcon={ArrowClockwiseIcon}
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
        return null;
    }
  };

  // Banner content
  const renderBanner = () => {
    if (isInFeedbackMode) {
      return (
        <div className="bg-brand/10 border-b px-double py-base flex items-center gap-base">
          <span className="text-sm text-brand">
            {feedbackMode?.isTimedOut
              ? 'Approval has timed out - feedback cannot be submitted'
              : 'Providing feedback on plan'}
          </span>
        </div>
      );
    }

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
      variant={variant}
      agent={agent}
      error={displayError}
      banner={renderBanner()}
      headerLeft={
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
      }
      headerRight={
        <ToolbarDropdown label={sessionLabel} disabled={isInFeedbackMode}>
          {sessions.length > 0 ? (
            <>
              <DropdownMenuLabel>Sessions</DropdownMenuLabel>
              {sessions.map((s, index) => (
                <DropdownMenuItem
                  key={s.id}
                  icon={s.id === selectedSessionId ? CheckIcon : undefined}
                  onClick={() => onSelectSession(s.id)}
                >
                  {index === 0
                    ? 'Latest'
                    : formatDateShortWithTime(s.created_at)}
                </DropdownMenuItem>
              ))}
            </>
          ) : (
            <DropdownMenuItem disabled>No sessions</DropdownMenuItem>
          )}
        </ToolbarDropdown>
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
