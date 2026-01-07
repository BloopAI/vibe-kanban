import { AgentSelector } from '@/components/tasks/AgentSelector';
import { ConfigSelector } from '@/components/tasks/ConfigSelector';
import { cn } from '@/lib/utils';
import type { ExecutorConfig, ExecutorProfileId } from 'shared/types';

type Props = {
  profiles: Record<string, ExecutorConfig> | null;
  selectedProfile: ExecutorProfileId | null;
  onProfileSelect: (profile: ExecutorProfileId) => void;
  disabled?: boolean;
  showLabel?: boolean;
  className?: string;
  itemClassName?: string;
};

function ExecutorProfileSelector({
  profiles,
  selectedProfile,
  onProfileSelect,
  disabled = false,
  showLabel = true,
  className,
  itemClassName,
}: Props) {
  if (!profiles) {
    return null;
  }

  return (
    <div className={cn('flex gap-3 flex-col sm:flex-row', className)}>
      <AgentSelector
        profiles={profiles}
        selectedExecutorProfile={selectedProfile}
        onChange={onProfileSelect}
        disabled={disabled}
        showLabel={showLabel}
        className={itemClassName}
      />
      <ConfigSelector
        profiles={profiles}
        selectedExecutorProfile={selectedProfile}
        onChange={onProfileSelect}
        disabled={disabled}
        showLabel={showLabel}
        className={itemClassName}
      />
    </div>
  );
}

export default ExecutorProfileSelector;
