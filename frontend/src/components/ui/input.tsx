import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    const combinedRef = React.useCallback(
      (node: HTMLInputElement) => {
        innerRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }
      },
      [ref]
    );

    React.useEffect(() => {
      const input = innerRef.current;
      if (!input) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && document.activeElement === input) {
          input.blur();
        }
      };

      input.addEventListener('keydown', handleKeyDown);
      return () => input.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full border px-3 py-2 text-sm ring-offset-background file:border-0 bg-transparent file:text-sm file:font-medium focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={combinedRef}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
