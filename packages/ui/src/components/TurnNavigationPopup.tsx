import { useState, useRef, useCallback, type ReactNode } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';

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
  /** The trigger element (e.g. ArrowUp button) */
  children: ReactNode;
}

export function TurnNavigationPopup({
  turns,
  onNavigateToTurn,
  children,
}: TurnNavigationPopupProps) {
  const [open, setOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 200);
  }, [clearCloseTimeout]);

  const handleTriggerEnter = useCallback(() => {
    if (turns.length === 0) return;
    clearCloseTimeout();
    setOpen(true);
  }, [turns.length, clearCloseTimeout]);

  const handleTriggerLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  const handleContentEnter = useCallback(() => {
    clearCloseTimeout();
  }, [clearCloseTimeout]);

  const handleContentLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  const handleNavigate = useCallback(
    (patchKey: string) => {
      setOpen(false);
      onNavigateToTurn(patchKey);
    },
    [onNavigateToTurn]
  );

  if (turns.length === 0) {
    return <>{children}</>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          className="inline-flex"
          onMouseEnter={handleTriggerEnter}
          onMouseLeave={handleTriggerLeave}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-h-[min(60vh,var(--radix-popover-content-available-height))] flex flex-col"
        onMouseEnter={handleContentEnter}
        onMouseLeave={handleContentLeave}
        onOpenAutoFocus={(e) => e.preventDefault()}
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
                <button
                  type="button"
                  className="w-full text-left px-base py-half rounded hover:bg-secondary transition-colors group"
                  onClick={() => handleNavigate(turn.patchKey)}
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
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
