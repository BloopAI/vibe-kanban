import { AgentSelector } from '@/components/tasks/AgentSelector';
import { ConfigSelector } from '@/components/tasks/ConfigSelector';
import type { ExecutorConfig, ExecutorProfileId } from 'shared/types';

type Props = {
  profiles: Record<string, ExecutorConfig> | null;
  selectedProfile: ExecutorProfileId | null;
  onProfileSelect: (profile: ExecutorProfileId) => void;
  disabled?: boolean;
  showLabel?: boolean;
};

function ExecutorProfileSelector({
  profiles,
  selectedProfile,
  onProfileSelect,
  disabled = false,
  showLabel = true,
}: Props) {
  if (!profiles) {
    return null;
  }

  return (
    <div className="flex gap-3 flex-col sm:flex-row">
      <AgentSelector
        profiles={profiles}
        selectedExecutorProfile={selectedProfile}
        onChange={onProfileSelect}
        disabled={disabled}
        showLabel={showLabel}
      />
      <ConfigSelector
        profiles={profiles}
        selectedExecutorProfile={selectedProfile}
        onChange={onProfileSelect}
        disabled={disabled}
        showLabel={showLabel}
      />
    </div>
  );
}

export default ExecutorProfileSelector;
