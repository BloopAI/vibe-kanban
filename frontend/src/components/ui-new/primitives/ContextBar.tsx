import type { RefObject } from 'react';
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  CodeIcon,
  type Icon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useUserSystem } from '@/components/ConfigProvider';
import { IdeIcon, getIdeName } from '@/components/ide/IdeIcon';
import { useContextBarPosition } from '@/hooks/useContextBarPosition';

interface ContextBarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
  label: string;
  iconClassName?: string;
}

function ContextBarButton({
  icon: IconComponent,
  label,
  className,
  iconClassName,
  ...props
}: ContextBarButtonProps) {
  return (
    <button
      className={cn(
        'flex items-center justify-center transition-colors',
        'drop-shadow-[2px_2px_4px_rgba(121,121,121,0.25)]',
        className
      )}
      aria-label={label}
      title={label}
      {...props}
    >
      <IconComponent
        className={cn('size-icon-xl text-low hover:text-normal', iconClassName)}
        weight="bold"
      />
    </button>
  );
}

function DragHandle({
  onMouseDown,
  isDragging,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
}) {
  return (
    <div
      className={cn(
        'flex justify-center py-half border-b',
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
      onMouseDown={onMouseDown}
    >
      <div className="flex gap-[2px] py-half">
        <span className="size-dot rounded-full bg-low" />
        <span className="size-dot rounded-full bg-low" />
        <span className="size-dot rounded-full bg-low" />
      </div>
    </div>
  );
}

export interface ContextBarProps {
  containerRef: RefObject<HTMLElement | null>;
  copied?: boolean;
  onOpen?: () => void;
  onCopy?: () => void;
  onPreview?: () => void;
  onViewCode?: () => void;
}

export function ContextBar({
  containerRef,
  copied = false,
  onOpen,
  onCopy,
  onPreview,
  onViewCode,
}: ContextBarProps) {
  const { style, isDragging, dragHandlers } =
    useContextBarPosition(containerRef);
  const { config } = useUserSystem();
  const editorType = config?.editor?.editor_type ?? null;
  const ideLabel = `Open in ${getIdeName(editorType)}`;

  return (
    <div
      className={cn(
        'absolute z-50',
        !isDragging && 'transition-all duration-300 ease-out'
      )}
      style={style}
    >
      <div className="bg-secondary/50 backdrop-blur-sm border border-secondary rounded-sm shadow-[inset_2px_2px_5px_rgba(255,255,255,0.03),_0_0_10px_rgba(0,0,0,0.2)] px-base">
        <DragHandle
          onMouseDown={dragHandlers.onMouseDown}
          isDragging={isDragging}
        />

        <div className="flex flex-col py-double">
          {/* Primary Icons */}
          <div className="flex flex-col gap-double">
            <button
              className="flex items-center justify-center transition-colors drop-shadow-[2px_2px_4px_rgba(121,121,121,0.25)]"
              aria-label={ideLabel}
              title={ideLabel}
              onClick={onOpen}
            >
              <IdeIcon
                editorType={editorType}
                className="size-icon-base hover:text-normal opacity-50 hover:opacity-80"
              />
            </button>
            <ContextBarButton
              icon={copied ? CheckIcon : CopyIcon}
              label={copied ? 'Copied!' : 'Copy path'}
              onClick={onCopy}
              iconClassName={
                copied ? 'text-success hover:text-success' : undefined
              }
            />
          </div>

          {/* Separator */}
          <div className="h-px bg-border my-double" />

          {/* Secondary Icons */}
          <div className="flex flex-col gap-double">
            <ContextBarButton
              icon={EyeIcon}
              label="Preview"
              onClick={onPreview}
            />
            <ContextBarButton
              icon={CodeIcon}
              label="View Code"
              onClick={onViewCode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
