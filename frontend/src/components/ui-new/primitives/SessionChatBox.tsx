import { Microphone, Paperclip } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { VibeKanbanLogo } from './VibeKanbanLogo';
import { PrimaryButton } from './PrimaryButton';
import { Toolbar, ToolbarIconButton, ToolbarDropdown } from './Toolbar';

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
}: SessionChatBoxProps) {
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
          <ToolbarDropdown label="Latest" />
        </Toolbar>
      </div>

      {/* Editor area */}
      <div className="flex flex-col gap-base bg-primary px-double py-plusfifty">
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
            <ToolbarIconButton icon={Microphone} aria-label="Voice input" />
            <ToolbarIconButton icon={Paperclip} aria-label="Attach file" />
          </Toolbar>
          <PrimaryButton onClick={onSend}>Send</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
