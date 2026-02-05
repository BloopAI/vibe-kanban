import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
      props.checked ? 'bg-foreground' : 'bg-secondary',
      className
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-3.5 w-3.5 rounded-full shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-3.5 data-[state=unchecked]:translate-x-0',
        props.checked ? 'bg-secondary' : 'bg-low'
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
