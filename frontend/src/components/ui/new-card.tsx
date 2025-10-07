import * as React from 'react';

import { cn } from '@/lib/utils';

const NewCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col', className)} {...props} />
));
NewCard.displayName = 'NewCard';

interface NewCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode;
}

const NewCardHeader = React.forwardRef<HTMLDivElement, NewCardHeaderProps>(
  ({ className, actions, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative bg-background text-foreground text-base flex items-center gap-2 px-3 border-b border-dashed',
        // add a solid top line via ::before, except on the first header
        'before:content-[""] before:absolute before:top-0 before:left-0 before:right-0 ' +
          'before:h-px before:bg-border first:before:hidden',
        actions && 'justify-between',
        className
      )}
      {...props}
    >
      {actions ? (
        <>
          <div className="min-w-0 flex-1 py-3">{children}</div>
          <div className="flex items-center gap-4">{actions}</div>
        </>
      ) : (
        children
      )}
    </div>
  )
);
NewCardHeader.displayName = 'NewCardHeader';

const NewCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex-1 bg-muted text-foreground gap-2', className)}
    {...props}
  />
));
NewCardContent.displayName = 'CardContent';

export { NewCard, NewCardHeader, NewCardContent };
export type { NewCardHeaderProps };
