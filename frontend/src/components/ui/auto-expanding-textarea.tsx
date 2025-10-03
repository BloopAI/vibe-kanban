import * as React from 'react';
import { cn } from '@/lib/utils';

interface AutoExpandingTextareaProps extends React.ComponentProps<'textarea'> {
  maxRows?: number;
  onCommandEnter?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCommandShiftEnter?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onShiftTab?: () => void;
}

const AutoExpandingTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoExpandingTextareaProps
>(
  (
    {
      className,
      maxRows = 10,
      onCommandEnter,
      onCommandShiftEnter,
      onShiftTab,
      ...props
    },
    ref
  ) => {
    const internalRef = React.useRef<HTMLTextAreaElement>(null);

    // Get the actual ref to use
    const textareaRef = ref || internalRef;

    const adjustHeight = React.useCallback(() => {
      const textarea = (textareaRef as React.RefObject<HTMLTextAreaElement>)
        .current;
      if (!textarea) return;

      // Reset height to auto to get the natural height
      textarea.style.height = 'auto';

      // Calculate line height
      const style = window.getComputedStyle(textarea);
      const lineHeight = parseInt(style.lineHeight) || 20;
      const paddingTop = parseInt(style.paddingTop) || 0;
      const paddingBottom = parseInt(style.paddingBottom) || 0;

      // Calculate max height based on maxRows
      const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom;

      // Set the height to scrollHeight, but cap at maxHeight
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }, [maxRows]);

    // Adjust height on mount and when content changes
    React.useEffect(() => {
      adjustHeight();
    }, [adjustHeight, props.value]);

    // Handle keyboard shortcuts
    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Handle Shift+Tab for variant cycling
        if (e.key === 'Tab' && e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          onShiftTab?.();
          return;
        }

        if (e.key === 'Enter') {
          if (e.metaKey && e.shiftKey) {
            onCommandShiftEnter?.(e);
          } else if (e.metaKey) {
            onCommandEnter?.(e);
          }
        }
        props.onKeyDown?.(e);
      },
      [onCommandEnter, onCommandShiftEnter, onShiftTab, props.onKeyDown]
    );

    // Adjust height on input
    const handleInput = React.useCallback(
      (e: React.FormEvent<HTMLTextAreaElement>) => {
        adjustHeight();
        if (props.onInput) {
          props.onInput(e);
        }
      },
      [adjustHeight, props.onInput]
    );

    return (
      <textarea
        className={cn(
          'bg-muted p-0 min-h-[80px] w-full text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words',
          className
        )}
        ref={textareaRef}
        onInput={handleInput}
        {...props}
        onKeyDown={handleKeyDown}
      />
    );
  }
);

AutoExpandingTextarea.displayName = 'AutoExpandingTextarea';

export { AutoExpandingTextarea };
