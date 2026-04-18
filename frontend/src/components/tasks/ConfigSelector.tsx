import { Settings2, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import type { ExecutorProfileId } from 'shared/types';
import { describeExecutorVariant } from '@/lib/executorProfiles';

interface ConfigSelectorProps {
  profiles: Record<string, Record<string, unknown>> | null;
  selectedExecutorProfile: ExecutorProfileId | null;
  onChange: (profile: ExecutorProfileId) => void;
  disabled?: boolean;
  className?: string;
  showLabel?: boolean;
}

export function ConfigSelector({
  profiles,
  selectedExecutorProfile,
  onChange,
  disabled,
  className = '',
  showLabel = false,
}: ConfigSelectorProps) {
  const selectedAgent = selectedExecutorProfile?.executor;
  const configs = selectedAgent && profiles ? profiles[selectedAgent] : null;
  const configOptions = configs ? Object.keys(configs).sort() : [];
  const selectedVariant = selectedExecutorProfile?.variant || 'DEFAULT';
  const selectedSummary = describeExecutorVariant(
    profiles,
    selectedAgent,
    selectedExecutorProfile?.variant ?? null
  );

  if (
    !selectedAgent ||
    !profiles ||
    !configs ||
    Object.keys(configs).length === 0
  )
    return null;

  return (
    <div className="flex-1">
      {showLabel && (
        <Label htmlFor="executor-variant" className="text-sm font-medium">
          Configuration
        </Label>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`w-full justify-between text-xs ${showLabel ? 'mt-1.5' : ''} ${className}`}
            disabled={disabled}
            aria-label="Select configuration"
          >
            <div className="flex items-center gap-1.5 w-full min-w-0">
              <Settings2 className="h-3 w-3 shrink-0" />
              <div className="min-w-0 text-left">
                <div className="truncate">{selectedVariant}</div>
                {selectedSummary && (
                  <div className="truncate text-[10px] text-muted-foreground">
                    {selectedSummary}
                  </div>
                )}
              </div>
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
              <div className="min-w-0">
                <div>{variant}</div>
                {describeExecutorVariant(
                  profiles,
                  selectedAgent,
                  variant === 'DEFAULT' ? null : variant
                ) && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {describeExecutorVariant(
                      profiles,
                      selectedAgent,
                      variant === 'DEFAULT' ? null : variant
                    )}
                  </div>
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
