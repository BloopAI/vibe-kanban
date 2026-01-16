import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow rounded-xl',
        destructive:
          'bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 rounded-xl',
        outline:
          'border border-border/60 bg-background hover:bg-muted hover:border-border rounded-xl shadow-sm',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-xl shadow-sm',
        ghost:
          'hover:bg-muted/60 hover:text-foreground rounded-xl',
        link:
          'text-primary hover:underline underline-offset-4',
        icon:
          'bg-transparent rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50',
      },
      size: {
        default: 'h-10 px-5 py-2.5',
        xs: 'h-8 px-3 text-xs rounded-lg',
        sm: 'h-9 px-4 rounded-lg',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    compoundVariants: [{ variant: 'icon', class: 'p-0 h-auto' }],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={twMerge(cn(buttonVariants({ variant, size, className })))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
