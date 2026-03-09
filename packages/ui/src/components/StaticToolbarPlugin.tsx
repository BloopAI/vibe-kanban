import { type ReactNode } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { FORMAT_TEXT_COMMAND, UNDO_COMMAND } from 'lexical';
import { INSERT_MARKDOWN_LIST_COMMAND } from './MarkdownInsertPlugin';
import {
  TextB,
  TextItalic,
  TextStrikethrough,
  Code,
  ListBullets,
  ListNumbers,
  ArrowCounterClockwise,
  Eye,
  PencilSimple,
  type Icon,
  CheckIcon,
} from '@phosphor-icons/react';
import { cn } from '../lib/cn';

interface ToolbarButtonProps {
  onClick: () => void;
  icon: Icon;
  label: string;
  active?: boolean;
}

function ToolbarButton({
  onClick,
  icon: Icon,
  label,
  active,
}: ToolbarButtonProps) {
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
      className={cn(
        'p-half rounded-sm transition-colors',
        active
          ? 'text-normal bg-panel'
          : 'text-low hover:text-normal hover:bg-panel/50'
      )}
    >
      <Icon className="size-icon-sm" weight="bold" />
    </button>
  );
}

interface StaticToolbarPluginProps {
  saveStatus?: 'idle' | 'saved';
  extraActions?: ReactNode;
  isPreviewMode?: boolean;
  onTogglePreview?: () => void;
  /** Called when a formatting button is clicked while the editor is read-only.
   *  The parent should switch to edit mode; the command will be dispatched after. */
  onRequestEdit?: () => void;
  /** Whether the editor is currently in read-only / preview mode */
  readOnly?: boolean;
}

export function StaticToolbarPlugin({
  saveStatus,
  extraActions,
  isPreviewMode = false,
  onTogglePreview,
  onRequestEdit,
  readOnly,
}: StaticToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();

  /** Dispatch a command, switching to edit mode first if needed */
  const dispatch = (fn: () => void) => {
    if (readOnly && onRequestEdit) {
      onRequestEdit();
      // Dispatch after a tick so the editor becomes editable first
      requestAnimationFrame(() => {
        editor.focus();
        editor.update(fn);
      });
    } else {
      fn();
    }
  };

  return (
    <div className="flex items-center gap-half mt-half px-base py-half border-t border-border/50">
      {/* Undo button */}
      <ToolbarButton
        onClick={() =>
          dispatch(() => editor.dispatchCommand(UNDO_COMMAND, undefined))
        }
        icon={ArrowCounterClockwise}
        label="Undo"
      />

      {/* Separator */}
      <div className="w-px h-4 bg-border mx-half" />

      {/* Text formatting buttons — insert markdown syntax */}
      <ToolbarButton
        onClick={() =>
          dispatch(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'))
        }
        icon={TextB}
        label="Bold"
      />
      <ToolbarButton
        onClick={() =>
          dispatch(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'))
        }
        icon={TextItalic}
        label="Italic"
      />
      <ToolbarButton
        onClick={() =>
          dispatch(() =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
          )
        }
        icon={TextStrikethrough}
        label="Strikethrough"
      />
      <ToolbarButton
        onClick={() =>
          dispatch(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code'))
        }
        icon={Code}
        label="Inline Code"
      />

      {/* Separator */}
      <div className="w-px h-4 bg-border mx-half" />

      {/* List buttons */}
      <ToolbarButton
        onClick={() =>
          dispatch(() =>
            editor.dispatchCommand(INSERT_MARKDOWN_LIST_COMMAND, 'bullet')
          )
        }
        icon={ListBullets}
        label="Bullet List"
      />
      <ToolbarButton
        onClick={() =>
          dispatch(() =>
            editor.dispatchCommand(INSERT_MARKDOWN_LIST_COMMAND, 'number')
          )
        }
        icon={ListNumbers}
        label="Numbered List"
      />

      {/* Preview toggle */}
      {onTogglePreview && (
        <>
          <div className="w-px h-4 bg-border mx-half" />
          <ToolbarButton
            onClick={onTogglePreview}
            icon={isPreviewMode ? PencilSimple : Eye}
            label={isPreviewMode ? 'Edit' : 'Preview'}
            active={isPreviewMode}
          />
        </>
      )}

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
