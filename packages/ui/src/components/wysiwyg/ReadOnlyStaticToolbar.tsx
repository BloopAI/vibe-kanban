import { type ReactNode } from 'react';
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
import { cn } from '../../lib/cn';

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

interface ReadOnlyStaticToolbarProps {
  saveStatus?: 'idle' | 'saved';
  extraActions?: ReactNode;
  onRequestEdit?: () => void;
}

/**
 * Static toolbar for read-only mode. Same visual layout as StaticToolbarPlugin
 * but without Lexical dependency. All buttons call `onRequestEdit` to switch
 * to edit mode.
 */
export function ReadOnlyStaticToolbar({
  saveStatus,
  extraActions,
  onRequestEdit,
}: ReadOnlyStaticToolbarProps) {
  const handleClick = () => onRequestEdit?.();

  return (
    <div className="flex items-center gap-half mt-half px-base py-half border-t border-border/50">
      <ToolbarButton
        onClick={handleClick}
        icon={ArrowCounterClockwise}
        label="Undo"
      />
      <div className="w-px h-4 bg-border mx-half" />
      <ToolbarButton onClick={handleClick} icon={TextB} label="Bold" />
      <ToolbarButton onClick={handleClick} icon={TextItalic} label="Italic" />
      <ToolbarButton
        onClick={handleClick}
        icon={TextStrikethrough}
        label="Strikethrough"
      />
      <ToolbarButton onClick={handleClick} icon={Code} label="Inline Code" />
      <div className="w-px h-4 bg-border mx-half" />
      <ToolbarButton
        onClick={handleClick}
        icon={ListBullets}
        label="Bullet List"
      />
      <ToolbarButton
        onClick={handleClick}
        icon={ListNumbers}
        label="Numbered List"
      />

      {extraActions && (
        <>
          <div className="w-px h-4 bg-border mx-half" />
          <div className="flex items-center gap-half">{extraActions}</div>
        </>
      )}

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
