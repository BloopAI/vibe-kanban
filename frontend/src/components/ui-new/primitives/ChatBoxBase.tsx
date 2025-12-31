import { type ReactNode } from 'react';
import { CheckIcon, MicrophoneIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { toPrettyCase } from '@/utils/string';
import type { BaseCodingAgent } from 'shared/types';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { AgentIcon } from '@/components/agents/AgentIcon';
import { Toolbar, ToolbarIconButton, ToolbarDropdown } from './Toolbar';
import { DropdownMenuItem, DropdownMenuLabel } from './Dropdown';

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

export interface VariantProps {
  selected: string | null;
  options: string[];
  onChange: (variant: string | null) => void;
}

interface ChatBoxBaseProps {
  // Editor
  editor: EditorProps;
  placeholder: string;
  onCmdEnter: () => void;
  disabled?: boolean;
  projectId?: string;

  // Variant selection
  variant?: VariantProps;

  // Agent icon
  agent?: BaseCodingAgent | null;

  // Error display
  error?: string | null;

  // Header content (right side - session/executor dropdown)
  headerRight: ReactNode;

  // Header content (left side - stats)
  headerLeft?: ReactNode;

  // Footer left content (additional toolbar items like attach button)
  footerLeft?: ReactNode;

  // Footer right content (action buttons)
  footerRight: ReactNode;

  // Banner content (queued message indicator, feedback mode indicator)
  banner?: ReactNode;
}

/**
 * Base chat box layout component.
 * Provides shared structure for CreateChatBox and SessionChatBox.
 */
export function ChatBoxBase({
  editor,
  placeholder,
  onCmdEnter,
  disabled,
  projectId,
  variant,
  agent,
  error,
  headerRight,
  headerLeft,
  footerLeft,
  footerRight,
  banner,
}: ChatBoxBaseProps) {
  const variantLabel = toPrettyCase(variant?.selected || 'DEFAULT');
  const variantOptions = variant?.options ?? [];

  return (
    <div
      className={cn(
        'flex w-chat max-w-full flex-col border-t',
        '@chat:border-x @chat:rounded-t-md'
      )}
    >
      {/* Error alert */}
      {error && (
        <div className="bg-error/10 border-b px-double py-base">
          <p className="text-error text-sm">{error}</p>
        </div>
      )}

      {/* Banner content (queued indicator, feedback mode, etc.) */}
      {banner}

      {/* Header - Stats and selector */}
      <div className="flex items-center gap-base bg-secondary px-double py-[9px] @chat:rounded-t-md border-b">
        <div className="flex flex-1 items-center gap-base text-sm">
          {headerLeft}
        </div>
        <Toolbar className="gap-[9px]">
          <AgentIcon agent={agent} className="size-icon-xl" />
          {headerRight}
        </Toolbar>
      </div>

      {/* Editor area */}
      <div className="flex flex-col gap-plusfifty bg-primary px-double py-plusfifty">
        <WYSIWYGEditor
          placeholder={placeholder}
          value={editor.value}
          onChange={editor.onChange}
          onCmdEnter={onCmdEnter}
          disabled={disabled}
          className="min-h-0"
          projectId={projectId}
        />

        {/* Footer - Controls */}
        <div className="flex items-end justify-between">
          <Toolbar className="flex-1 gap-double">
            <ToolbarDropdown label={variantLabel} disabled={disabled}>
              <DropdownMenuLabel>Variants</DropdownMenuLabel>
              {variantOptions.map((variantName) => (
                <DropdownMenuItem
                  key={variantName}
                  icon={
                    variant?.selected === variantName ? CheckIcon : undefined
                  }
                  onClick={() => variant?.onChange(variantName)}
                >
                  {toPrettyCase(variantName)}
                </DropdownMenuItem>
              ))}
            </ToolbarDropdown>
            <ToolbarIconButton
              icon={MicrophoneIcon}
              aria-label="Voice input"
              disabled={disabled}
            />
            {footerLeft}
          </Toolbar>
          <div className="flex gap-base">{footerRight}</div>
        </div>
      </div>
    </div>
  );
}
