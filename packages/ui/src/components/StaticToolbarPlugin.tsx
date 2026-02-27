import { type ReactNode } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { FORMAT_TEXT_COMMAND, UNDO_COMMAND } from 'lexical';
import {
  TextB,
  TextItalic,
  TextStrikethrough,
  Code,
  ListBullets,
  ListNumbers,
  ArrowCounterClockwise,
  type Icon,
  CheckIcon,
} from '@phosphor-icons/react';
import { INSERT_MARKDOWN_LIST_COMMAND } from './MarkdownInsertPlugin';
import { cn } from '../lib/cn';

interface ToolbarButtonProps {
  onClick: () => void;
  icon: Icon;
  label: string;
}

function ToolbarButton({ onClick, icon: Icon, label }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent losing selection when clicking toolbar
        e.preventDefault();
        onClick();
      }}
      aria-label={label}
      title={label}
      className="p-half rounded-sm transition-colors text-low hover:text-normal hover:bg-panel/50"
    >
      <Icon className="size-icon-sm" weight="bold" />
    </button>
  );
}

interface StaticToolbarPluginProps {
  saveStatus?: 'idle' | 'saved';
  extraActions?: ReactNode;
}

export function StaticToolbarPlugin({
  saveStatus,
  extraActions,
}: StaticToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();

  return (
    <div className="flex items-center gap-half mt-base p-base border-t border-border/50">
      {/* Undo button */}
      <ToolbarButton
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        icon={ArrowCounterClockwise}
        label="Undo"
      />

      {/* Separator */}
      <div className="w-px h-4 bg-border mx-half" />

      {/* Text formatting buttons — insert markdown syntax */}
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
        icon={TextB}
        label="Bold"
      />
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
        icon={TextItalic}
        label="Italic"
      />
      <ToolbarButton
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
        }
        icon={TextStrikethrough}
        label="Strikethrough"
      />
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
        icon={Code}
        label="Inline Code"
      />

      {/* Separator */}
      <div className="w-px h-4 bg-border mx-half" />

      {/* List buttons — insert markdown list prefixes */}
      <ToolbarButton
        onClick={() =>
          editor.dispatchCommand(INSERT_MARKDOWN_LIST_COMMAND, 'bullet')
        }
        icon={ListBullets}
        label="Bullet List"
      />
      <ToolbarButton
        onClick={() =>
          editor.dispatchCommand(INSERT_MARKDOWN_LIST_COMMAND, 'number')
        }
        icon={ListNumbers}
        label="Numbered List"
      />

      {extraActions && (
        <>
          <div className="w-px h-4 bg-border mx-half" />
          <div className="flex items-center gap-half">{extraActions}</div>
        </>
      )}

      {/* Save Status Indicator */}
      {saveStatus && (
        <div
          className={cn(
            'ml-auto mr-base flex items-center transition-opacity duration-300',
            saveStatus === 'idle' ? 'opacity-0' : 'opacity-100'
          )}
        >
          <CheckIcon className="size-icon-sm text-success" weight="bold" />
        </div>
      )}
    </div>
  );
}
