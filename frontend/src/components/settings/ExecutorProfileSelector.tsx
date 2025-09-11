import { Settings2, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import type {
  BaseCodingAgent,
  ExecutorConfig,
  ExecutorProfileId,
} from 'shared/types';

type Props = {
  profiles: Record<string, ExecutorConfig> | null;
  selectedProfile: ExecutorProfileId | null;
  onProfileSelect: (profile: ExecutorProfileId) => void;
  disabled?: boolean;
  showLabel?: boolean;
  showVariantSelector?: boolean;
};

function ExecutorProfileSelector({
  profiles,
  selectedProfile,
  onProfileSelect,
  disabled = false,
  showLabel = true,
  showVariantSelector = true,
}: Props) {
  if (!profiles) {
    return null;
  }

  const handleExecutorChange = (executor: string) => {
    onProfileSelect({
      executor: executor as BaseCodingAgent,
      variant: null,
    });
  };

  const handleVariantChange = (variant: string) => {
    if (selectedProfile) {
      onProfileSelect({
        ...selectedProfile,
        variant: variant === 'DEFAULT' ? null : variant,
      });
    }
  };

  const currentProfile = selectedProfile
    ? profiles[selectedProfile.executor]
    : null;
  const hasVariants = currentProfile && Object.keys(currentProfile).length > 0;

  return (
    <div className="flex gap-3 flex-col sm:flex-row">
      {/* Executor Profile Selector */}
      <div className="flex-1">
        {showLabel && (
          <Label htmlFor="executor-profile" className="text-sm font-medium">
            Agent
          </Label>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between text-xs mt-1.5"
              disabled={disabled}
            >
              <div className="flex items-center gap-1.5">
                <Settings2 className="h-3 w-3" />
                <span className="truncate">
                  {selectedProfile?.executor || 'Select profile'}
                </span>
              </div>
              <ArrowDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-full">
            {Object.keys(profiles)
              .sort((a, b) => a.localeCompare(b))
              .map((executorKey) => (
                <DropdownMenuItem
                  key={executorKey}
                  onClick={() => handleExecutorChange(executorKey)}
                  className={
                    selectedProfile?.executor === executorKey ? 'bg-accent' : ''
                  }
                >
                  {executorKey}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Variant Selector (conditional) */}
      {showVariantSelector &&
        selectedProfile &&
        hasVariants &&
        currentProfile && (
          <div className="flex-1">
            <Label htmlFor="executor-variant" className="text-sm font-medium">
              Configuration
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between text-xs mt-1.5"
                  disabled={disabled}
                >
                  <span className="truncate">
                    {selectedProfile.variant || 'DEFAULT'}
                  </span>
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                {Object.keys(currentProfile).map((variantKey) => (
                  <DropdownMenuItem
                    key={variantKey}
                    onClick={() => handleVariantChange(variantKey)}
                    className={
                      selectedProfile.variant === variantKey ? 'bg-accent' : ''
                    }
                  >
                    {variantKey}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

      {/* Show disabled variant selector for profiles without variants */}
      {showVariantSelector &&
        selectedProfile &&
        !hasVariants &&
        currentProfile && (
          <div className="flex-1">
            <Label htmlFor="executor-variant" className="text-sm font-medium">
              Configuration
            </Label>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="w-full text-xs justify-start mt-1.5"
            >
              Default
            </Button>
          </div>
        )}

      {/* Show placeholder for variant when no profile selected */}
      {showVariantSelector && !selectedProfile && (
        <div className="flex-1">
          <Label htmlFor="executor-variant" className="text-sm font-medium">
            Configuration
          </Label>
          <Button
            variant="outline"
            size="sm"
            disabled
            className="w-full text-xs justify-start mt-1.5"
          >
            Select agent first
          </Button>
        </div>
      )}
    </div>
  );
}

export default ExecutorProfileSelector;
