import { useSequentialShortcuts } from '@/contexts/SequentialShortcutsContext';
import { cn } from '@/lib/utils';

export function KeySequenceIndicator() {
  const { buffer, invalidBuffer, isSequenceActive, isInvalidSequence } =
    useSequentialShortcuts();

  if (!isSequenceActive && !isInvalidSequence) return null;

  // Use invalidBuffer when showing error state, otherwise use current buffer
  const displayBuffer = isInvalidSequence ? invalidBuffer : buffer;

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-[10001]',
        'animate-in fade-in-0 zoom-in-95 duration-150',
        isInvalidSequence && 'animate-shake'
      )}
      data-testid="sequence-indicator"
    >
      <div
        className={cn(
          'flex items-center gap-1 rounded-sm border',
          'backdrop-blur-sm px-base py-half shadow-lg',
          isInvalidSequence
            ? 'border-error bg-error/10'
            : 'border-border bg-panel/95'
        )}
      >
        {displayBuffer.map((key, index) => (
          <kbd
            key={index}
            className={cn(
              'inline-flex items-center justify-center',
              'min-w-[24px] h-6 px-1.5',
              'rounded-sm border bg-secondary',
              'font-ibm-plex-mono text-sm',
              isInvalidSequence
                ? 'border-error text-error'
                : 'border-border text-high'
            )}
          >
            {key.toUpperCase()}
          </kbd>
        ))}
        {!isInvalidSequence && (
          <span className="text-low text-sm ml-1">...</span>
        )}
      </div>
    </div>
  );
}
