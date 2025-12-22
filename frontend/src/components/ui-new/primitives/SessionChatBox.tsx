import { useRef } from 'react';
import {
  MicrophoneIcon,
  PaperclipIcon,
  CheckIcon,
  ClockIcon,
  XIcon,
  PaperPlaneTiltIcon,
  ArrowClockwiseIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { Session } from 'shared/types';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { VibeKanbanLogo } from './VibeKanbanLogo';
import { PrimaryButton } from './PrimaryButton';
import { Toolbar, ToolbarIconButton, ToolbarDropdown } from './Toolbar';
import { DropdownMenuItem, DropdownMenuLabel } from './Dropdown';

// Status enum - single source of truth for execution state
export type ExecutionStatus =
  | 'idle'
  | 'sending'
  | 'running'
  | 'queued'
  | 'stopping'
  | 'queue-loading';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

interface ActionsProps {
  onSend: () => void;
  onQueue: () => void;
  onCancelQueue: () => void;
  onStop: () => void;
  onAttach: () => void;
}

interface SessionProps {
  sessions?: Session[];
  selectedSessionId?: string;
  onSelectSession?: (sessionId: string) => void;
}

interface StatsProps {
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
}

interface VariantProps {
  selected: string | null;
  options: string[];
  onChange: (variant: string | null) => void;
}

interface SessionChatBoxProps {
  // Core state
  status: ExecutionStatus;
  editor: EditorProps;
  actions: ActionsProps;

  // Variant selection (optional)
  variant?: VariantProps;

  // Optional groups
  session?: SessionProps;
  stats?: StatsProps;

  // Other
  error?: string | null;
}

function formatSessionDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Convert SCREAMING_SNAKE_CASE to Capitalised English
// "DEFAULT" → "Default", "CUSTOM_VARIANT" → "Custom Variant"
function formatVariantName(name: string): string {
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function SessionChatBox({
  status,
  editor,
  actions,
  variant,
  session,
  stats,
  error,
}: SessionChatBoxProps) {
  // File input ref for attachments
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived state from status
  const isDisabled = status === 'sending' || status === 'stopping';
  const canSend =
    editor.value.trim().length > 0 &&
    !['sending', 'stopping', 'queue-loading'].includes(status);
  const isQueued = status === 'queued';
  const isRunning = status === 'running' || status === 'queued';

  // Placeholder
  const placeholder = 'Continue working on this task...';

  // Variant display - format for readability
  const variantLabel = formatVariantName(variant?.selected || 'DEFAULT');
  const variantOptions = variant?.options ?? [];

  // Cmd+Enter maps to correct action based on status
  const handleCmdEnter = () => {
    if (status === 'running' && canSend) actions.onQueue();
    else if (status === 'idle' && canSend) actions.onSend();
  };

  // File input handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith('image/')
    );
    if (files.length > 0) {
      // For now, just trigger attach - container handles the actual upload
      actions.onAttach();
    }
    e.target.value = '';
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  // Session dropdown
  const sessions = session?.sessions ?? [];
  const selectedSessionId = session?.selectedSessionId;
  const isLatestSelected =
    sessions.length > 0 && selectedSessionId === sessions[0].id;
  const sessionLabel = isLatestSelected ? 'Latest' : 'Previous';

  // Stats
  const filesChanged = stats?.filesChanged ?? 0;
  const linesAdded = stats?.linesAdded;
  const linesRemoved = stats?.linesRemoved;

  // Render action buttons based on status
  const renderActionButtons = () => {
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
    }
  };

  return (
    <div
      className={cn(
        'flex w-chat max-w-full flex-col border-t',
        '@chat:border-x @chat:rounded-t-md'
      )}
    >
      {/* Error alert */}
      {error && (
        <div className="bg-error/10 border-b border-error px-double py-base">
          <p className="text-error text-sm">{error}</p>
        </div>
      )}

      {/* Queued message indicator */}
      {isQueued && (
        <div className="bg-secondary border-b px-double py-base flex items-center gap-base">
          <ClockIcon className="h-4 w-4 text-low" />
          <span className="text-sm text-low">
            Message queued - will execute when current run finishes
          </span>
        </div>
      )}

      {/* Header - File stats and version selector */}
      <div className="flex items-center gap-base bg-secondary px-double py-[9px] @chat:rounded-t-md border-b">
        <div className="flex flex-1 items-center gap-base text-sm">
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
        </div>
        <Toolbar className="gap-[9px]">
          <VibeKanbanLogo />
          <ToolbarDropdown label={sessionLabel}>
            {sessions.length > 0 ? (
              <>
                <DropdownMenuLabel>Sessions</DropdownMenuLabel>
                {sessions.map((s, index) => (
                  <DropdownMenuItem
                    key={s.id}
                    icon={s.id === selectedSessionId ? CheckIcon : undefined}
                    onClick={() => session?.onSelectSession?.(s.id)}
                  >
                    {index === 0 ? 'Latest' : formatSessionDate(s.created_at)}
                  </DropdownMenuItem>
                ))}
              </>
            ) : (
              <DropdownMenuItem disabled>No sessions</DropdownMenuItem>
            )}
          </ToolbarDropdown>
        </Toolbar>
      </div>

      {/* Editor area */}
      <div className="flex flex-col gap-plusfifty bg-primary px-double py-plusfifty">
        <WYSIWYGEditor
          placeholder={placeholder}
          value={editor.value}
          onChange={editor.onChange}
          onCmdEnter={handleCmdEnter}
          disabled={isDisabled}
          className="min-h-0"
        />

        {/* Footer - Controls */}
        <div className="flex items-end justify-between">
          <Toolbar className="flex-1 gap-double">
            <ToolbarDropdown label={variantLabel}>
              <DropdownMenuLabel>Variants</DropdownMenuLabel>
              {variantOptions.map((variantName) => (
                <DropdownMenuItem
                  key={variantName}
                  icon={
                    variant?.selected === variantName ? CheckIcon : undefined
                  }
                  onClick={() => variant?.onChange(variantName)}
                >
                  {formatVariantName(variantName)}
                </DropdownMenuItem>
              ))}
            </ToolbarDropdown>
            <ToolbarIconButton
              icon={MicrophoneIcon}
              aria-label="Voice input"
              disabled={isDisabled}
            />
            <ToolbarIconButton
              icon={PaperclipIcon}
              aria-label="Attach file"
              onClick={handleAttachClick}
              disabled={isDisabled || isRunning}
            />
            {/* Hidden file input for attachments */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
          </Toolbar>
          <div className="flex gap-base">{renderActionButtons()}</div>
        </div>
      </div>
    </div>
  );
}
