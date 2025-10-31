import * as React from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { useKeyExit, useKeySubmit, Scope } from '@/keyboard';

const Dialog = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    uncloseable?: boolean;
  }
>(({ className, open, onOpenChange, children, uncloseable, ...props }, ref) => {
  const { enableScope, disableScope } = useHotkeysContext();

  // Manage dialog scope when open/closed
  React.useEffect(() => {
    if (open) {
      enableScope(Scope.DIALOG);
      disableScope(Scope.KANBAN);
      disableScope(Scope.PROJECTS);
    } else {
      disableScope(Scope.DIALOG);
      enableScope(Scope.KANBAN);
      enableScope(Scope.PROJECTS);
    }
    return () => {
      disableScope(Scope.DIALOG);
      enableScope(Scope.KANBAN);
      enableScope(Scope.PROJECTS);
    };
  }, [open, enableScope, disableScope]);

  // Dialog keyboard shortcuts using semantic hooks
  useKeyExit(
    (e) => {
      if (uncloseable) return;

      // Two-step Esc behavior:
      // 1. If input/textarea is focused, blur it first
      const activeElement = document.activeElement as HTMLElement;
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable)
      ) {
        activeElement.blur();
        e?.preventDefault();
        return;
      }

      // 2. Otherwise close the dialog
      onOpenChange?.(false);
    },
    {
      scope: Scope.DIALOG,
      when: () => !!open,
    }
  );

  useKeySubmit(
    (e) => {
      // Don't interfere if user is typing in textarea (allow new lines)
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // Look for submit button or primary action button within this dialog
      if (ref && typeof ref === 'object' && ref.current) {
        // First try to find a submit button
        const submitButton = ref.current.querySelector(
          'button[type="submit"]'
        ) as HTMLButtonElement;
        if (submitButton && !submitButton.disabled) {
          e?.preventDefault();
          submitButton.click();
          return;
        }

        // If no submit button, look for primary action button
        const buttons = Array.from(
          ref.current.querySelectorAll('button')
        ) as HTMLButtonElement[];
        const primaryButton = buttons.find(
          (btn) =>
            !btn.disabled &&
            !btn.textContent?.toLowerCase().includes('cancel') &&
            !btn.textContent?.toLowerCase().includes('close') &&
            btn.type !== 'button'
        );

        if (primaryButton) {
          e?.preventDefault();
          primaryButton.click();
        }
      }
    },
    {
      scope: Scope.DIALOG,
      when: () => !!open,
    }
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => (uncloseable ? {} : onOpenChange?.(false))}
      />
      <div
        ref={ref}
        className={cn(
          'relative z-[9999] grid w-full max-w-lg gap-4 bg-primary p-6 shadow-lg duration-200 sm:rounded-lg my-8',
          className
        )}
        {...props}
      >
        {!uncloseable && (
          <button
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 z-10"
            onClick={() => onOpenChange?.(false)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        )}
        {children}
      </div>
    </div>
  );
});
Dialog.displayName = 'Dialog';

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-4', className)} {...props} />
));
DialogContent.displayName = 'DialogContent';

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};
