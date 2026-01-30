import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const ToggleGroup = ToggleGroupPrimitive.Root;

const toggleGroupItemVariants = cva(
  'inline-flex items-center justify-center rounded-sm font-medium ring-offset-background transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      active: {
        true: 'bg-background text-foreground shadow-sm font-semibold',
        false: 'text-muted-foreground/60 hover:text-muted-foreground',
      },
      size: {
        default: 'h-4 w-4 text-sm',
        sm: 'h-6 px-2 text-xs',
        md: 'h-8 px-3 text-sm',
      },
    },
    defaultVariants: {
      active: false,
      size: 'default',
    },
  }
);

interface ToggleGroupItemProps
  extends React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>,
    VariantProps<typeof toggleGroupItemVariants> {}

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  ToggleGroupItemProps
>(({ className, active, size, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(toggleGroupItemVariants({ active, size }), className)}
    {...props}
  />
));
ToggleGroupItem.displayName = 'ToggleGroupItem';

export { ToggleGroup, ToggleGroupItem };
