import { memo, forwardRef, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ExecutorConfig } from 'shared/types';
import { describeExecutorVariant } from '@/lib/executorProfiles';

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
    const selectedConfig =
      currentProfile?.[(selectedVariant || 'DEFAULT') as keyof typeof currentProfile];
    const selectedExecutor = selectedConfig
      ? Object.keys(selectedConfig as Record<string, unknown>)[0]
      : null;
    const selectedSummary = describeExecutorVariant(
      currentProfile as Record<string, Record<string, unknown>>,
      selectedExecutor,
      selectedVariant
    );

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
              'w-18 md:w-24 px-2 flex items-center justify-between transition-all',
              isAnimating && 'scale-105 bg-accent',
              className
            )}
            disabled={disabled}
          >
            <div className="min-w-0 flex-1 text-left">
              <div className="text-xs truncate">
                {selectedVariant || 'DEFAULT'}
              </div>
              {selectedSummary && (
                <div className="text-[10px] truncate text-muted-foreground">
                  {selectedSummary}
                </div>
              )}
            </div>
            <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {Object.entries(currentProfile)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([variantLabel, variantConfig]) => {
              const executor = Object.keys(
                variantConfig as Record<string, unknown>
              )[0];
              const summary = describeExecutorVariant(
                currentProfile as Record<string, Record<string, unknown>>,
                executor,
                variantLabel
              );
              return (
              <DropdownMenuItem
                key={variantLabel}
                onClick={() => onChange(variantLabel)}
                className={selectedVariant === variantLabel ? 'bg-accent' : ''}
              >
                <div className="min-w-0">
                  <div>{variantLabel}</div>
                  {summary && (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {summary}
                    </div>
                  )}
                </div>
              </DropdownMenuItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

VariantSelectorInner.displayName = 'VariantSelector';
export const VariantSelector = memo(VariantSelectorInner);
