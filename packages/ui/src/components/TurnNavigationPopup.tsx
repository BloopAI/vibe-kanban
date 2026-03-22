import { ListNumbersIcon } from '@phosphor-icons/react';
import { cn } from '../lib/cn';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
} from './Popover';
import { Tooltip } from './Tooltip';

export interface TurnNavigationItem {
  /** Unique key for this entry (patchKey from DisplayEntry) */
  patchKey: string;
  /** The user message content text */
  content: string;
  /** 1-indexed turn number */
  turnNumber: number;
}

interface TurnNavigationPopupProps {
  /** List of user messages to navigate to */
  turns: TurnNavigationItem[];
  /** Called when user clicks a turn to scroll to it */
  onNavigateToTurn: (patchKey: string) => void;
  className?: string;
}

export function TurnNavigationPopup({
  turns,
  onNavigateToTurn,
  className,
}: TurnNavigationPopupProps) {
  const isEmpty = turns.length === 0;
  const tooltipText = isEmpty
    ? 'No messages yet'
    : `${turns.length} message${turns.length === 1 ? '' : 's'}`;

  if (isEmpty) {
    return (
      <Tooltip content={tooltipText} side="bottom">
        <span className="inline-flex">
          <button
            disabled
            className={cn(
              'flex items-center justify-center text-lowest opacity-40 cursor-not-allowed',
              className
            )}
            aria-label="Navigate conversation turns"
          >
            <ListNumbersIcon className="size-icon-base" />
          </button>
        </span>
      </Tooltip>
    );
  }

  return (
    <Popover>
      <Tooltip content={tooltipText} side="bottom">
        <span className="inline-flex">
          <PopoverTrigger asChild>
            <button
              className={cn(
                'flex items-center justify-center text-low hover:text-normal transition-colors',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand',
                className
              )}
              aria-label="Navigate conversation turns"
            >
              <ListNumbersIcon className="size-icon-base" />
            </button>
          </PopoverTrigger>
        </span>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-80 max-h-[min(60vh,var(--radix-popover-content-available-height))] flex flex-col"
      >
        <div className="flex flex-col gap-base min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <h4 className="text-sm font-medium text-normal">Your Messages</h4>
            <span className="text-xs text-low">
              {turns.length} turn{turns.length === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="space-y-0.5 overflow-y-auto min-h-0">
            {turns.map((turn) => (
              <li key={turn.patchKey}>
                <PopoverClose asChild>
                  <button
                    type="button"
                    className="w-full text-left px-base py-half rounded hover:bg-secondary transition-colors group"
                    onClick={() => onNavigateToTurn(turn.patchKey)}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-low shrink-0 tabular-nums">
                        #{turn.turnNumber}
                      </span>
                      <span className="text-sm text-normal truncate group-hover:text-high">
                        {turn.content}
                      </span>
                    </div>
                  </button>
                </PopoverClose>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
