import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { useKeyExit, Scope } from '@/keyboard';

interface TaskDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  uncloseable?: boolean;
  ariaLabel?: string;
}

const TaskDialog = React.forwardRef<HTMLDivElement, TaskDialogProps>(
  (
    { className, open, onOpenChange, children, uncloseable, ariaLabel },
    ref
  ) => {
    const { enableScope, disableScope } = useHotkeysContext();

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

    useKeyExit(
      (e) => {
        if (uncloseable) return;

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
        onOpenChange?.(false);
      },
      {
        scope: Scope.DIALOG,
        when: () => !!open,
        enableOnFormTags: ['input', 'INPUT', 'textarea', 'TEXTAREA'],
      }
    );

    if (!open) return null;

    return (
      <div
        className="fixed inset-0 z-[9999] flex items-start justify-center p-4 overflow-y-auto"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        <div
          className="fixed inset-0 bg-black/50"
          onClick={() => !uncloseable && onOpenChange?.(false)}
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className={cn(
            'relative z-[9999] w-full max-w-lg bg-primary shadow-lg duration-200 rounded-lg my-8',
            className
          )}
        >
          <button
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 z-10"
            onClick={() => {
              if (!uncloseable) onOpenChange?.(false);
            }}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
          {children}
        </div>
      </div>
    );
  }
);
TaskDialog.displayName = 'TaskDialog';

const TaskDialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('', className)} {...props} />
));
TaskDialogContent.displayName = 'TaskDialogContent';

export { TaskDialog, TaskDialogContent };
