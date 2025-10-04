import * as React from 'react';

import { cn } from '@/lib/utils';

const NewCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('', className)} {...props} />
));
NewCard.displayName = 'NewCard';

const NewCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative bg-primary text-foreground text-base flex items-center gap-2 p-3 border-b border-dashed',
      // add a solid top line via ::before, except on the first header
      'before:content-[""] before:absolute before:top-0 before:left-0 before:right-0 ' +
        'before:h-px before:bg-border first:before:hidden',
      className
    )}
    {...props}
  />
));
NewCardHeader.displayName = 'NewCardHeader';

const NewCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'bg-background text-foreground flex items-center gap-2 p-3',
      className
    )}
    {...props}
  />
));
NewCardContent.displayName = 'CardContent';

export { NewCard, NewCardHeader, NewCardContent };
