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
      'bg-primary text-foreground flex items-center gap-2 p-3 border-b border-dashed',
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
