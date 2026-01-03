import type { RefObject } from 'react';
import {
  CheckIcon,
  CopyIcon,
  CodeIcon,
  PlayIcon,
  PauseIcon,
  SpinnerIcon,
  type Icon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useUserSystem } from '@/components/ConfigProvider';
import { IdeIcon, getIdeName } from '@/components/ide/IdeIcon';
import { useContextBarPosition } from '@/hooks/useContextBarPosition';
import { useDevServer } from '@/hooks/useDevServer';

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
        'text-low group-hover:text-normal',
        className
      )}
      aria-label={label}
      title={label}
      {...props}
    >
      <IconComponent
        className={cn('size-icon-base', iconClassName)}
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
        <span className="size-dot rounded-full bg-panel group-hover:bg-low transition" />
        <span className="size-dot rounded-full bg-panel group-hover:bg-low transition" />
        <span className="size-dot rounded-full bg-panel group-hover:bg-low transition" />
      </div>
    </div>
  );
}

export interface ContextBarProps {
  containerRef: RefObject<HTMLElement | null>;
  copied?: boolean;
  onOpen?: () => void;
  onCopy?: () => void;
  onViewCode?: () => void;
  attemptId?: string;
}

export function ContextBar({
  containerRef,
  copied = false,
  onOpen,
  onCopy,
  onViewCode,
  attemptId,
}: ContextBarProps) {
  const { style, isDragging, dragHandlers } =
    useContextBarPosition(containerRef);
  const { config } = useUserSystem();
  const editorType = config?.editor?.editor_type ?? null;
  const ideLabel = `Open in ${getIdeName(editorType)}`;
  const { start, stop, isStarting, isStopping, runningDevServer } =
    useDevServer(attemptId);

  return (
    <div
      className={cn(
        'absolute z-50',
        !isDragging && 'transition-all duration-300 ease-out'
      )}
      style={style}
    >
      <div className="group bg-secondary/50 backdrop-blur-sm border border-secondary rounded shadow-[inset_2px_2px_5px_rgba(255,255,255,0.03),_0_0_10px_rgba(0,0,0,0.2)] hover:shadow-[inset_2px_2px_5px_rgba(255,255,255,0.06),_0_0_10px_rgba(0,0,0,0.4)] transition-shadow px-base">
        <DragHandle
          onMouseDown={dragHandlers.onMouseDown}
          isDragging={isDragging}
        />

        <div className="flex flex-col py-base">
          {/* Primary Icons */}
          <div className="flex flex-col gap-base">
            <button
              className="flex items-center justify-center transition-colors drop-shadow-[2px_2px_4px_rgba(121,121,121,0.25)]"
              aria-label={ideLabel}
              title={ideLabel}
              onClick={onOpen}
            >
              <IdeIcon
                editorType={editorType}
                className="size-icon-xs opacity-50 group-hover:opacity-80 transition-opacity"
              />
            </button>
            <ContextBarButton
              icon={copied ? CheckIcon : CopyIcon}
              label={copied ? 'Copied!' : 'Copy path'}
              onClick={onCopy}
              iconClassName={
                copied
                  ? 'text-success hover:text-success group-hover:text-success'
                  : undefined
              }
            />
          </div>

          {/* Separator */}
          <div className="h-px bg-border my-base" />

          {/* Secondary Icons */}
          <div className="flex flex-col gap-base">
            {attemptId && (
              <ContextBarButton
                icon={
                  isStarting || isStopping
                    ? SpinnerIcon
                    : runningDevServer
                      ? PauseIcon
                      : PlayIcon
                }
                label={
                  isStarting
                    ? 'Starting dev server...'
                    : isStopping
                      ? 'Stopping dev server...'
                      : runningDevServer
                        ? 'Stop dev server'
                        : 'Start dev server'
                }
                onClick={() => {
                  if (runningDevServer) {
                    stop();
                  } else {
                    start();
                  }
                }}
                disabled={isStarting || isStopping}
                iconClassName={cn(
                  isStarting || isStopping ? 'animate-spin' : undefined,
                  runningDevServer && !isStopping
                    ? 'text-error hover:text-error group-hover:text-error'
                    : undefined
                )}
              />
            )}
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
