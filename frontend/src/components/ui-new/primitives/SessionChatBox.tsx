import {
  MicrophoneIcon,
  PaperclipIcon,
  CheckIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { Session } from 'shared/types';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { VibeKanbanLogo } from './VibeKanbanLogo';
import { PrimaryButton } from './PrimaryButton';
import { Toolbar, ToolbarIconButton, ToolbarDropdown } from './Toolbar';
import { DropdownMenuItem, DropdownMenuLabel } from './Dropdown';

interface SessionChatBoxProps {
  /** Number of files changed in current session */
  filesChanged?: number;
  /** Number of lines added */
  linesAdded?: number;
  /** Number of lines removed */
  linesRemoved?: number;
  /** Placeholder text for the editor */
  placeholder?: string;
  /** Current editor value (markdown) */
  value?: string;
  /** Called when editor content changes */
  onChange?: (value: string) => void;
  /** Called when send button is clicked or Cmd+Enter is pressed */
  onSend?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Available sessions for this workspace */
  sessions?: Session[];
  /** Currently selected session ID */
  selectedSessionId?: string;
  /** Called when a session is selected */
  onSelectSession?: (sessionId: string) => void;
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

export function SessionChatBox({
  filesChanged = 0,
  linesAdded,
  linesRemoved,
  placeholder = 'If whales could talk, what would they tell us?',
  value = '',
  onChange,
  onSend,
  className,
  sessions = [],
  selectedSessionId,
  onSelectSession,
}: SessionChatBoxProps) {
  // Determine the label for the session dropdown
  const isLatestSelected =
    sessions.length > 0 && selectedSessionId === sessions[0].id;
  const sessionLabel = isLatestSelected ? 'Latest' : 'Previous';

  return (
    <div
      className={cn(
        `flex w-chat max-w-full flex-col border-t`,
        `@chat:border-x @chat:rounded-t-md`,
        className
      )}
    >
      {/* Header - File stats and version selector */}
      <div
        className={`flex items-center gap-base bg-secondary px-double py-[9px] @chat:rounded-t-md border-b`}
      >
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
                {sessions.map((session, index) => (
                  <DropdownMenuItem
                    key={session.id}
                    icon={
                      session.id === selectedSessionId ? CheckIcon : undefined
                    }
                    onClick={() => onSelectSession?.(session.id)}
                  >
                    {index === 0
                      ? 'Latest'
                      : formatSessionDate(session.created_at)}
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
          value={value}
          onChange={onChange}
          onCmdEnter={onSend}
          className="min-h-0"
        />

        {/* Footer - Controls */}
        <div className="flex items-end justify-between">
          <Toolbar className="flex-1 gap-double">
            <ToolbarDropdown label="Default" />
            <ToolbarIconButton icon={MicrophoneIcon} aria-label="Voice input" />
            <ToolbarIconButton icon={PaperclipIcon} aria-label="Attach file" />
          </Toolbar>
          <PrimaryButton onClick={onSend}>Send</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
