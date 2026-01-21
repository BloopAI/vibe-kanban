import { useRef } from 'react';
import {
  PaperclipIcon,
  CheckIcon,
  ClockIcon,
  XIcon,
  PlusIcon,
  SpinnerIcon,
  ChatCircleIcon,
  TrashIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type {
  BaseCodingAgent,
  Session,
  TodoItem,
  TokenUsageInfo,
} from 'shared/types';
import type { LocalImageMetadata } from '@/components/ui/wysiwyg/context/task-attempt-context';
import { formatDateShortWithTime } from '@/utils/date';
import { toPrettyCase } from '@/utils/string';
import { AgentIcon } from '@/components/agents/AgentIcon';
import {
  ChatBoxBase,
  VisualVariant,
  type DropzoneProps,
  type EditorProps,
  type VariantProps,
} from './ChatBoxBase';
import { PrimaryButton } from './PrimaryButton';
import { ToolbarIconButton, ToolbarDropdown } from './Toolbar';
import {
  type ActionDefinition,
  type ActionVisibilityContext,
  isSpecialIcon,
} from '../actions';
import {
  isActionEnabled,
  getActionTooltip,
} from '../actions/useActionVisibility';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './Dropdown';
import { type ExecutorProps } from './CreateChatBox';
import { ContextUsageGauge } from './ContextUsageGauge';
import { TodoProgressPopup } from './TodoProgressPopup';

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
  isNewSessionMode?: boolean;
  onNewSession?: () => void;
}

interface ToolbarActionsProps {
  actions: ActionDefinition[];
  context: ActionVisibilityContext;
  onExecuteAction: (action: ActionDefinition) => void;
}

interface StatsProps {
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  hasConflicts?: boolean;
  conflictedFilesCount?: number;
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

interface ApprovalModeProps {
  isActive: boolean;
  onApprove: () => void;
  onRequestChanges: () => void;
  isSubmitting: boolean;
  isTimedOut: boolean;
  error?: string | null;
}

interface ReviewCommentsProps {
  /** Number of review comments */
  count: number;
  /** Preview markdown of the comments */
  previewMarkdown: string;
  /** Clear all comments */
  onClear: () => void;
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
  approvalMode?: ApprovalModeProps;
  reviewComments?: ReviewCommentsProps;
  toolbarActions?: ToolbarActionsProps;
  error?: string | null;
  workspaceId?: string;
  projectId?: string;
  agent?: BaseCodingAgent | null;
  executor?: ExecutorProps;
  todos?: TodoItem[];
  inProgressTodo?: TodoItem | null;
  localImages?: LocalImageMetadata[];
  onViewCode?: () => void;
  tokenUsageInfo?: TokenUsageInfo | null;
  dropzone?: DropzoneProps;
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
  approvalMode,
  reviewComments,
  toolbarActions,
  error,
  workspaceId,
  projectId,
  agent,
  executor,
  todos,
  inProgressTodo,
  localImages,
  onViewCode,
  tokenUsageInfo,
  dropzone,
}: SessionChatBoxProps) {
  const { t } = useTranslation('tasks');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine if in feedback mode, edit mode, or approval mode
  const isInFeedbackMode = feedbackMode?.isActive ?? false;
  const isInEditMode = editMode?.isActive ?? false;
  const isInApprovalMode = approvalMode?.isActive ?? false;

  // Key to force editor remount when entering feedback/edit/approval mode (triggers auto-focus)
  const focusKey = isInFeedbackMode
    ? 'feedback'
    : isInEditMode
      ? 'edit'
      : isInApprovalMode
        ? 'approval'
        : 'normal';

  // Derived state from status
  const isDisabled =
    status === 'sending' ||
    status === 'stopping' ||
    feedbackMode?.isSubmitting ||
    editMode?.isSubmitting ||
    approvalMode?.isSubmitting;
  const hasContent =
    editor.value.trim().length > 0 || (reviewComments?.count ?? 0) > 0;
  const canSend =
    hasContent && !['sending', 'stopping', 'queue-loading'].includes(status);
  const isQueued = status === 'queued';
  const isRunning = status === 'running' || status === 'queued';
  const showRunningAnimation =
    (status === 'running' || status === 'queued' || status === 'sending') &&
    !isInApprovalMode &&
    editor.value.trim().length === 0;

  const placeholder = isInFeedbackMode
    ? 'Provide feedback for the plan...'
    : isInEditMode
      ? 'Edit your message...'
      : isInApprovalMode
        ? 'Provide feedback to request changes...'
        : session.isNewSessionMode
          ? 'Start a new conversation...'
          : 'Continue working on this task...';

  // Cmd+Enter handler
  const handleCmdEnter = () => {
    // Approval mode: Cmd+Enter triggers approve or request changes based on input
    if (isInApprovalMode && !approvalMode?.isTimedOut) {
      if (canSend) {
        approvalMode?.onRequestChanges();
      } else {
        approvalMode?.onApprove();
      }
      return;
    }
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
    ? t('conversation.sessions.newSession')
    : isLatestSelected
      ? t('conversation.sessions.latest')
      : t('conversation.sessions.previous');

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
            value={t('conversation.actions.cancel')}
          />
        );
      }
      return (
        <>
          <PrimaryButton
            variant="secondary"
            onClick={feedbackMode?.onCancel}
            value={t('conversation.actions.cancel')}
          />
          <PrimaryButton
            onClick={feedbackMode?.onSubmitFeedback}
            disabled={!canSend || feedbackMode?.isSubmitting}
            actionIcon={feedbackMode?.isSubmitting ? 'spinner' : undefined}
            value={t('conversation.actions.submitFeedback')}
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
            value={t('conversation.actions.cancel')}
          />
          <PrimaryButton
            onClick={editMode?.onSubmitEdit}
            disabled={!canSend || editMode?.isSubmitting}
            actionIcon={editMode?.isSubmitting ? 'spinner' : undefined}
            value={t('conversation.retry')}
          />
        </>
      );
    }

    // Approval mode
    if (isInApprovalMode) {
      if (approvalMode?.isTimedOut) {
        return (
          <PrimaryButton
            variant="secondary"
            onClick={actions.onStop}
            value={t('conversation.actions.stop')}
          />
        );
      }

      const hasMessage = editor.value.trim().length > 0;

      return (
        <>
          <PrimaryButton
            variant="secondary"
            onClick={actions.onStop}
            value={t('conversation.actions.stop')}
          />
          {hasMessage ? (
            <PrimaryButton
              onClick={approvalMode?.onRequestChanges}
              disabled={approvalMode?.isSubmitting}
              actionIcon={approvalMode?.isSubmitting ? 'spinner' : undefined}
              value={t('conversation.actions.requestChanges')}
            />
          ) : (
            <PrimaryButton
              onClick={approvalMode?.onApprove}
              disabled={approvalMode?.isSubmitting}
              actionIcon={approvalMode?.isSubmitting ? 'spinner' : undefined}
              value={t('conversation.actions.approve')}
            />
          )}
        </>
      );
    }

    switch (status) {
      case 'idle':
        return (
          <PrimaryButton
            onClick={actions.onSend}
            disabled={!canSend}
            value={t('conversation.actions.send')}
          />
        );

      case 'sending':
        return (
          <PrimaryButton
            onClick={actions.onStop}
            actionIcon="spinner"
            value={t('conversation.actions.sending')}
          />
        );

      case 'running':
        return (
          <>
            <PrimaryButton
              onClick={actions.onQueue}
              disabled={!canSend}
              value={t('conversation.actions.queue')}
            />
            <PrimaryButton
              onClick={actions.onStop}
              variant="secondary"
              value={t('conversation.actions.stop')}
              actionIcon="spinner"
            />
          </>
        );

      case 'queued':
        return (
          <>
            <PrimaryButton
              onClick={actions.onCancelQueue}
              value={t('conversation.actions.cancelQueue')}
              actionIcon={XIcon}
            />
            <PrimaryButton
              onClick={actions.onStop}
              variant="secondary"
              value={t('conversation.actions.stop')}
              actionIcon="spinner"
            />
          </>
        );

      case 'stopping':
        return (
          <PrimaryButton
            disabled
            value={t('conversation.actions.stopping')}
            actionIcon="spinner"
          />
        );
      case 'queue-loading':
        return (
          <PrimaryButton
            disabled
            value={t('conversation.actions.loading')}
            actionIcon="spinner"
          />
        );
      case 'feedback':
      case 'edit':
        return null;
    }
  };

  // Banner content
  const renderBanner = () => {
    const banners: React.ReactNode[] = [];

    // Review comments banner
    if (reviewComments && reviewComments.count > 0) {
      banners.push(
        <div
          key="review-comments"
          className="bg-accent/5 border-b px-double py-base flex items-center gap-base"
        >
          <ChatCircleIcon className="h-4 w-4 text-brand flex-shrink-0" />
          <span className="text-sm text-normal flex-1">
            {t('conversation.reviewComments.count', {
              count: reviewComments.count,
            })}
          </span>
          <button
            onClick={reviewComments.onClear}
            className="text-low hover:text-normal transition-colors p-1 -m-1"
            title={t('conversation.actions.clearReviewComments')}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      );
    }

    // Queued message banner
    if (isQueued) {
      banners.push(
        <div
          key="queued"
          className="bg-secondary border-b px-double py-base flex items-center gap-base"
        >
          <ClockIcon className="h-4 w-4 text-low" />
          <span className="text-sm text-low">
            {t('followUp.queuedMessage')}
          </span>
        </div>
      );
    }

    return banners.length > 0 ? <>{banners}</> : null;
  };

  // Combine errors
  const displayError = feedbackMode?.error ?? approvalMode?.error ?? error;

  // Determine visual variant
  const getVisualVariant = () => {
    if (isInFeedbackMode) return VisualVariant.FEEDBACK;
    if (isInEditMode) return VisualVariant.EDIT;
    if (isInApprovalMode) return VisualVariant.PLAN;
    return VisualVariant.NORMAL;
  };

  return (
    <ChatBoxBase
      editor={editor}
      placeholder={placeholder}
      onCmdEnter={handleCmdEnter}
      disabled={isDisabled}
      workspaceId={workspaceId}
      projectId={projectId}
      autoFocus={true}
      focusKey={focusKey}
      variant={variant}
      error={displayError}
      banner={renderBanner()}
      visualVariant={getVisualVariant()}
      isRunning={showRunningAnimation}
      onPasteFiles={actions.onPasteFiles}
      localImages={localImages}
      dropzone={dropzone}
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
                <DropdownMenuLabel>
                  {t('conversation.executors')}
                </DropdownMenuLabel>
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
          {/* Existing session mode: show in-progress todo when running, otherwise file stats */}
          {!isNewSessionMode && (
            <>
              {isRunning && inProgressTodo ? (
                <span className="text-sm flex items-center gap-1 min-w-0">
                  <SpinnerIcon className="size-icon-sm animate-spin flex-shrink-0" />
                  <span className="truncate">{inProgressTodo.content}</span>
                </span>
              ) : (
                <>
                  {stats?.hasConflicts && (
                    <span
                      className="flex items-center gap-1 text-warning text-sm"
                      title={t('conversation.approval.conflictWarning')}
                    >
                      <WarningIcon className="size-icon-sm" />
                      <span>
                        {t('conversation.approval.conflicts', {
                          count: stats.conflictedFilesCount,
                        })}
                      </span>
                    </span>
                  )}
                  <PrimaryButton variant="tertiary" onClick={onViewCode}>
                    <span className="text-sm space-x-half">
                      <span>
                        {t('diff.filesChanged', { count: filesChanged })}
                      </span>
                      {(linesAdded !== undefined ||
                        linesRemoved !== undefined) && (
                        <span className="space-x-half">
                          {linesAdded !== undefined && (
                            <span className="text-success">+{linesAdded}</span>
                          )}
                          {linesRemoved !== undefined && (
                            <span className="text-error">-{linesRemoved}</span>
                          )}
                        </span>
                      )}
                    </span>
                  </PrimaryButton>
                </>
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
          {/* Todo progress popup - always rendered, disabled when no todos */}
          <TodoProgressPopup todos={todos ?? []} />
          <ContextUsageGauge tokenUsageInfo={tokenUsageInfo} />
          <ToolbarDropdown
            label={sessionLabel}
            disabled={isInFeedbackMode || isInEditMode || isInApprovalMode}
          >
            {/* New Session option */}
            <DropdownMenuItem
              icon={isNewSessionMode ? CheckIcon : PlusIcon}
              onClick={() => onNewSession?.()}
            >
              {t('conversation.sessions.newSession')}
            </DropdownMenuItem>
            {sessions.length > 0 && <DropdownMenuSeparator />}
            {sessions.length > 0 ? (
              <>
                <DropdownMenuLabel>
                  {t('conversation.sessions.label')}
                </DropdownMenuLabel>
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
                      ? t('conversation.sessions.latest')
                      : formatDateShortWithTime(s.created_at)}
                  </DropdownMenuItem>
                ))}
              </>
            ) : (
              <DropdownMenuItem disabled>
                {t('conversation.sessions.noPreviousSessions')}
              </DropdownMenuItem>
            )}
          </ToolbarDropdown>
        </>
      }
      footerLeft={
        <>
          <ToolbarIconButton
            icon={PaperclipIcon}
            aria-label={t('tasks:taskFormDialog.attachImage')}
            title={t('tasks:taskFormDialog.attachImage')}
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
          {toolbarActions?.actions.map((action) => {
            const icon = action.icon;
            // Skip special icons in toolbar (only standard phosphor icons)
            if (isSpecialIcon(icon)) return null;
            const actionEnabled = isActionEnabled(
              action,
              toolbarActions.context
            );
            const isButtonDisabled = isDisabled || isRunning || !actionEnabled;
            const label =
              typeof action.label === 'function'
                ? action.label()
                : action.label;
            const tooltip = getActionTooltip(action, toolbarActions.context);
            return (
              <ToolbarIconButton
                key={action.id}
                icon={icon}
                aria-label={label}
                title={tooltip}
                onClick={() => toolbarActions.onExecuteAction(action)}
                disabled={isButtonDisabled}
              />
            );
          })}
        </>
      }
      footerRight={renderActionButtons()}
    />
  );
}
