import { Label } from '@/components/ui/label';
import BranchSelector from '@/components/tasks/BranchSelector';
import ExecutorProfileSelector from './ExecutorProfileSelector';
import type {
  GitBranch,
  ExecutorConfig,
  ExecutorProfileId,
} from 'shared/types';

type Props = {
  // Branch selector props
  branches?: GitBranch[];
  selectedBranch?: string | null;
  onBranchSelect?: (branch: string) => void;
  showBranchSelector?: boolean;
  branchSelectorProps?: {
    placeholder?: string;
    className?: string;
    excludeCurrentBranch?: boolean;
  };

  // Executor profile selector props
  profiles?: Record<string, ExecutorConfig> | null;
  selectedProfile?: ExecutorProfileId | null;
  onProfileSelect?: (profile: ExecutorProfileId) => void;
  showExecutorSelector?: boolean;
  executorSelectorProps?: {
    showLabel?: boolean;
    showVariantSelector?: boolean;
    className?: string;
  };

  // Common props
  disabled?: boolean;
  className?: string;
};

function TaskSettings({
  // Branch selector props
  branches = [],
  selectedBranch,
  onBranchSelect,
  showBranchSelector = true,
  branchSelectorProps = {},

  // Executor profile selector props
  profiles,
  selectedProfile,
  onProfileSelect,
  showExecutorSelector = true,
  executorSelectorProps = {},

  // Common props
  disabled = false,
  className = '',
}: Props) {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Executor Profile Selector */}
      {showExecutorSelector &&
        profiles &&
        selectedProfile &&
        onProfileSelect && (
          <ExecutorProfileSelector
            profiles={profiles}
            selectedProfile={selectedProfile}
            onProfileSelect={onProfileSelect}
            disabled={disabled}
            {...executorSelectorProps}
          />
        )}

      {/* Branch Selector */}
      {showBranchSelector &&
        branches.length > 0 &&
        selectedBranch !== undefined &&
        onBranchSelect && (
          <div>
            <Label htmlFor="base-branch" className="text-sm font-medium">
              Branch
            </Label>
            <BranchSelector
              branches={branches}
              selectedBranch={selectedBranch}
              onBranchSelect={onBranchSelect}
              placeholder="Select branch"
              className="mt-1.5"
              {...branchSelectorProps}
            />
          </div>
        )}
    </div>
  );
}

export default TaskSettings;
