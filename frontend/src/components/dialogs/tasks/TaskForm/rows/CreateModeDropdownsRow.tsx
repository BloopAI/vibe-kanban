import { AgentSelector } from '@/components/tasks/AgentSelector';
import { ConfigSelector } from '@/components/tasks/ConfigSelector';
import BranchSelector from '@/components/tasks/BranchSelector';
import { useTaskFormStore } from '@/stores/useTaskFormStore';
import type { GitBranch } from 'shared/types';

interface CreateModeDropdownsRowProps {
  profiles: Record<string, Record<string, unknown>> | null;
  branches: GitBranch[];
  disabled?: boolean;
}

export function CreateModeDropdownsRow({
  profiles,
  branches,
  disabled,
}: CreateModeDropdownsRowProps) {
  const autoStart = useTaskFormStore((s) => s.autoStart);
  const selectedExecutorProfile = useTaskFormStore(
    (s) => s.selectedExecutorProfile
  );
  const selectedBranch = useTaskFormStore((s) => s.selectedBranch);
  const setSelectedExecutorProfile = useTaskFormStore(
    (s) => s.setSelectedExecutorProfile
  );
  const setSelectedBranch = useTaskFormStore((s) => s.setSelectedBranch);

  return (
    <div
      className={`flex items-center gap-2 h-9 transition-opacity duration-200 ${
        autoStart ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {profiles && (
        <AgentSelector
          profiles={profiles}
          selectedExecutorProfile={selectedExecutorProfile}
          onChange={setSelectedExecutorProfile}
          disabled={disabled}
          className="h-9 flex-1"
        />
      )}
      {profiles && (
        <ConfigSelector
          profiles={profiles}
          selectedExecutorProfile={selectedExecutorProfile}
          onChange={setSelectedExecutorProfile}
          disabled={disabled}
          className="h-9 flex-1"
        />
      )}
      {branches.length > 0 && (
        <BranchSelector
          branches={branches}
          selectedBranch={selectedBranch}
          onBranchSelect={setSelectedBranch}
          placeholder="Branch"
          className={`h-9 flex-1 text-xs ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        />
      )}
    </div>
  );
}
