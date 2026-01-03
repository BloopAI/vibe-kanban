import { GitBranchIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  RepoCard,
  type RepoAction,
} from '@/components/ui-new/primitives/RepoCard';
import { InputField } from '@/components/ui-new/primitives/InputField';
import { SectionHeader } from '@/components/ui-new/primitives/SectionHeader';
import { ErrorAlert } from '@/components/ui-new/primitives/ErrorAlert';
import { CollapsibleSection } from '../primitives/CollapsibleSection';
import { PERSIST_KEYS } from '@/stores/useUiPreferencesStore';

export interface RepoInfo {
  id: string;
  name: string;
  targetBranch: string;
  commitsAhead: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

interface GitPanelProps {
  repos: RepoInfo[];
  workingBranchName: string;
  onWorkingBranchNameChange: (name: string) => void;
  onActionsClick?: (repoId: string, action: RepoAction) => void;
  onAddRepo?: () => void;
  className?: string;
  error?: string | null;
}

export function GitPanel({
  repos,
  workingBranchName,
  onWorkingBranchNameChange,
  onActionsClick,
  className,
  error,
}: GitPanelProps) {
  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col text-low overflow-y-auto',
        className
      )}
    >
      {error && <ErrorAlert message={error} />}
      <SectionHeader title="Repositories" />
      <div className="flex flex-col p-base gap-base">
        <div className="flex flex-col gap-base">
          {repos.map((repo) => (
            <RepoCard
              key={repo.id}
              repoId={repo.id}
              name={repo.name}
              targetBranch={repo.targetBranch}
              commitsAhead={repo.commitsAhead}
              filesChanged={repo.filesChanged}
              linesAdded={repo.linesAdded}
              linesRemoved={repo.linesRemoved}
              onChangeTarget={() => onActionsClick?.(repo.id, 'change-target')}
              onRebase={() => onActionsClick?.(repo.id, 'rebase')}
              onActionsClick={(action) => onActionsClick?.(repo.id, action)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-base w-full">
          <CollapsibleSection
            title="Advanced"
            persistKey={PERSIST_KEYS.gitAdvancedSettings}
            defaultExpanded={false}
            className="flex flex-col gap-half"
          >
            <div className="flex gap-base items-center">
              <GitBranchIcon className="size-icon-xs text-base" weight="fill" />
              <p className="text-sm font-medium text-low truncate">
                Working Branch
              </p>
            </div>
            <InputField
              variant="editable"
              value={workingBranchName}
              onChange={onWorkingBranchNameChange}
              placeholder="e.g acme Corp"
            />
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
