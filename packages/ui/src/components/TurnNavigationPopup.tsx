import {
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn';
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
  /** Returns the patchKey of the currently visible user message */
  getActiveTurnPatchKey?: () => string | null;
  /** The trigger element (e.g. ArrowUp button) */
  children: ReactNode;
}

export function TurnNavigationPopup({
  turns,
  onNavigateToTurn,
  getActiveTurnPatchKey,
  children,
}: TurnNavigationPopupProps) {
  const [open, setOpen] = useState(false);
  const [activePatchKey, setActivePatchKey] = useState<string | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lastNavigatedRef = useRef<string | null>(null);

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
    // Prefer the last navigated turn (scroll may still be in progress),
    // falling back to viewport detection for manual scrolls.
    const active =
      lastNavigatedRef.current ?? getActiveTurnPatchKey?.() ?? null;
    lastNavigatedRef.current = null;
    setActivePatchKey(active);
    setOpen(true);
  }, [turns.length, clearCloseTimeout, getActiveTurnPatchKey]);

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
      lastNavigatedRef.current = patchKey;
      setOpen(false);
      onNavigateToTurn(patchKey);
    },
    [onNavigateToTurn]
  );

  // Scroll the list to show the active turn (or bottom if none).
  // Avoid scrollIntoView() as it can scroll ancestor containers.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    if (activePatchKey) {
      const activeEl = list.querySelector<HTMLElement>(
        `[data-patch-key="${activePatchKey}"]`
      );
      if (activeEl) {
        const top = activeEl.offsetTop - list.offsetTop;
        list.scrollTop =
          top - list.clientHeight / 2 + activeEl.offsetHeight / 2;
        return;
      }
    }
    list.scrollTop = list.scrollHeight;
  }, [open, activePatchKey]);

  if (turns.length === 0) {
    return <>{children}</>;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
    >
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

          <ul ref={listRef} className="space-y-0.5 overflow-y-auto min-h-0">
            {turns.map((turn) => {
              const isActive = turn.patchKey === activePatchKey;
              return (
                <li key={turn.patchKey} data-patch-key={turn.patchKey}>
                  <button
                    type="button"
                    className={cn(
                      'w-full text-left px-base py-half rounded transition-colors group',
                      isActive
                        ? 'bg-brand/10 border-l-2 border-brand'
                        : 'hover:bg-secondary'
                    )}
                    onClick={() => handleNavigate(turn.patchKey)}
                  >
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          'text-xs shrink-0 tabular-nums',
                          isActive ? 'text-brand' : 'text-low'
                        )}
                      >
                        #{turn.turnNumber}
                      </span>
                      <span
                        className={cn(
                          'text-sm truncate',
                          isActive
                            ? 'text-brand font-medium'
                            : 'text-normal group-hover:text-high'
                        )}
                      >
                        {turn.content}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
