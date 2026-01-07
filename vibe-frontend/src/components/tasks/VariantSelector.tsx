import { memo, forwardRef, useEffect, useState } from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ExecutorConfig } from 'shared/types';

type Props = {
  currentProfile: ExecutorConfig | null;
  selectedVariant: string | null;
  onChange: (variant: string | null) => void;
  disabled?: boolean;
  className?: string;
};

const VariantSelectorInner = forwardRef<HTMLButtonElement, Props>(
  ({ currentProfile, selectedVariant, onChange, disabled, className }, ref) => {
    // Bump-effect animation when cycling through variants
    const [isAnimating, setIsAnimating] = useState(false);
    useEffect(() => {
      if (!currentProfile) return;
      setIsAnimating(true);
      const t = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(t);
    }, [selectedVariant, currentProfile]);

    const hasVariants =
      currentProfile && Object.keys(currentProfile).length > 0;

    if (!currentProfile) return null;

    if (!hasVariants) {
      return (
        <Button
          ref={ref}
          variant="outline"
          size="sm"
          className={cn(
            'h-10 w-24 px-2 flex items-center justify-between',
            className
          )}
          disabled
        >
          <span className="text-xs truncate flex-1 text-left">Default</span>
        </Button>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={ref}
            variant="secondary"
            size="sm"
            className={cn(
              'px-2 flex items-center justify-between transition-all',
              isAnimating && 'scale-105 bg-accent',
              className
            )}
            disabled={disabled}
          >
            <Settings2 className="h-3 w-3 mr-1 flex-shrink-0" />
            <span className="text-xs truncate flex-1 text-left">
              {selectedVariant || 'DEFAULT'}
            </span>
            <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {Object.entries(currentProfile).map(([variantLabel]) => (
            <DropdownMenuItem
              key={variantLabel}
              onClick={() => onChange(variantLabel)}
              className={selectedVariant === variantLabel ? 'bg-accent' : ''}
            >
              {variantLabel}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

VariantSelectorInner.displayName = 'VariantSelector';
export const VariantSelector = memo(VariantSelectorInner);
