import { GitBranchIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  RepoCard,
  type RepoAction,
} from '@/components/ui-new/primitives/RepoCard';
import { InputField } from '@/components/ui-new/primitives/InputField';
import { ErrorAlert } from '@/components/ui-new/primitives/ErrorAlert';
import { CollapsibleSection } from '../primitives/CollapsibleSection';
import { CollapsibleSectionHeader } from '../primitives/CollapsibleSectionHeader';
import { PERSIST_KEYS } from '@/stores/useUiPreferencesStore';

export interface RepoInfo {
  id: string;
  name: string;
  targetBranch: string;
  commitsAhead: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  prNumber?: number;
  prUrl?: string;
  prStatus?: 'open' | 'merged' | 'closed' | 'unknown';
}

interface GitPanelProps {
  repos: RepoInfo[];
  workingBranchName: string;
  onWorkingBranchNameChange: (name: string) => void;
  onActionsClick?: (repoId: string, action: RepoAction) => void;
  onOpenInEditor?: (repoId: string) => void;
  onCopyPath?: (repoId: string) => void;
  onAddRepo?: () => void;
  className?: string;
  error?: string | null;
}

export function GitPanel({
  repos,
  workingBranchName,
  onWorkingBranchNameChange,
  onActionsClick,
  onOpenInEditor,
  onCopyPath,
  className,
  error,
}: GitPanelProps) {
  const { t } = useTranslation(['tasks', 'common']);

  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col text-low overflow-y-auto',
        className
      )}
    >
      {error && <ErrorAlert message={error} />}
      <CollapsibleSectionHeader
        title={t('common:sections.repositories')}
        persistKey={PERSIST_KEYS.gitPanelRepositories}
        contentClassName="flex flex-col p-base gap-base"
      >
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
              prNumber={repo.prNumber}
              prUrl={repo.prUrl}
              prStatus={repo.prStatus}
              onChangeTarget={() => onActionsClick?.(repo.id, 'change-target')}
              onRebase={() => onActionsClick?.(repo.id, 'rebase')}
              onActionsClick={(action) => onActionsClick?.(repo.id, action)}
              onOpenInEditor={() => onOpenInEditor?.(repo.id)}
              onCopyPath={() => onCopyPath?.(repo.id)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-base w-full">
          <CollapsibleSection
            title={t('common:sections.advanced')}
            persistKey={PERSIST_KEYS.gitAdvancedSettings}
            defaultExpanded={false}
            className="flex flex-col gap-half"
          >
            <div className="flex gap-base items-center">
              <GitBranchIcon className="size-icon-xs text-base" weight="fill" />
              <p className="text-sm font-medium text-low truncate">
                {t('common:sections.workingBranch')}
              </p>
            </div>
            <InputField
              variant="editable"
              value={workingBranchName}
              onChange={onWorkingBranchNameChange}
              placeholder={t('gitPanel.advanced.placeholder')}
            />
          </CollapsibleSection>
        </div>
      </CollapsibleSectionHeader>
    </div>
  );
}
