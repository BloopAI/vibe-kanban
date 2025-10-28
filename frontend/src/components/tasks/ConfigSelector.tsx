import React from 'react';
import { Settings2, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ExecutorProfileId } from 'shared/types';

interface ConfigSelectorProps {
  profiles: Record<string, Record<string, unknown>> | null;
  selectedExecutorProfile: ExecutorProfileId | null;
  onChange: (profile: ExecutorProfileId) => void;
  disabled?: boolean;
  className?: string;
}

export const ConfigSelector = React.memo<ConfigSelectorProps>(
  ({
    profiles,
    selectedExecutorProfile,
    onChange,
    disabled,
    className = '',
  }) => {
    const selectedAgent = selectedExecutorProfile?.executor;
    if (!selectedAgent || !profiles) return null;

    const configs = profiles[selectedAgent];
    if (!configs || Object.keys(configs).length === 0) return null;

    const configOptions = React.useMemo(
      () => Object.keys(configs).sort(),
      [configs]
    );

    const selectedVariant = selectedExecutorProfile?.variant || 'DEFAULT';

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`w-full justify-between text-xs ${className}`}
            disabled={disabled}
            aria-label="Select configuration"
          >
            <div className="flex items-center gap-1.5 w-full">
              <Settings2 className="h-3 w-3" />
              <span className="truncate">{selectedVariant}</span>
            </div>
            <ArrowDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          {configOptions.map((variant) => (
            <DropdownMenuItem
              key={variant}
              onClick={() => {
                onChange({
                  executor: selectedAgent,
                  variant: variant === 'DEFAULT' ? null : variant,
                });
              }}
              className={
                (variant === 'DEFAULT' ? null : variant) ===
                selectedExecutorProfile?.variant
                  ? 'bg-accent'
                  : ''
              }
            >
              {variant}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

ConfigSelector.displayName = 'ConfigSelector';
