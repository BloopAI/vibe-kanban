import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CollapsibleSectionHeader } from '@/components/ui-new/primitives/CollapsibleSectionHeader';
import { SelectedReposList } from '@/components/ui-new/primitives/SelectedReposList';
import { ProjectSelectorContainer } from '@/components/ui-new/containers/ProjectSelectorContainer';
import { RecentReposListContainer } from '@/components/ui-new/containers/RecentReposListContainer';
import { BrowseRepoButtonContainer } from '@/components/ui-new/containers/BrowseRepoButtonContainer';
import { CreateRepoButtonContainer } from '@/components/ui-new/containers/CreateRepoButtonContainer';
import { WarningIcon } from '@phosphor-icons/react';
import { PERSIST_KEYS } from '@/stores/useUiPreferencesStore';
import type { Project, GitBranch, Repo } from 'shared/types';

interface GitPanelCreateProps {
  className?: string;
  repos: Repo[];
  projects: Project[];
  selectedProjectId: string | null;
  selectedProjectName?: string;
  onProjectSelect: (project: Project) => void;
  onCreateProject: () => void;
  onRepoRemove: (repoId: string) => void;
  branchesByRepo: Record<string, GitBranch[]>;
  targetBranches: Record<string, string>;
  onBranchChange: (repoId: string, branch: string) => void;
  registeredRepoPaths: string[];
  onRepoRegistered: (repo: Repo) => void;
}

export function GitPanelCreate({
  className,
  repos,
  projects,
  selectedProjectId,
  selectedProjectName,
  onProjectSelect,
  onCreateProject,
  onRepoRemove,
  branchesByRepo,
  targetBranches,
  onBranchChange,
  registeredRepoPaths,
  onRepoRegistered,
}: GitPanelCreateProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const hasNoRepos = repos.length === 0;

  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col text-low overflow-y-auto',
        className
      )}
    >
      <CollapsibleSectionHeader
        title={t('common:sections.project')}
        persistKey={PERSIST_KEYS.gitPanelProject}
        contentClassName="p-base border-b"
      >
        <ProjectSelectorContainer
          projects={projects}
          selectedProjectId={selectedProjectId}
          selectedProjectName={selectedProjectName}
          onProjectSelect={onProjectSelect}
          onCreateProject={onCreateProject}
        />
      </CollapsibleSectionHeader>

      <CollapsibleSectionHeader
        title={t('common:sections.repositories')}
        persistKey={PERSIST_KEYS.gitPanelRepositories}
        contentClassName="p-base border-b"
      >
        {hasNoRepos ? (
          <div className="flex items-center gap-2 p-base rounded bg-warning/10 border border-warning/20">
            <WarningIcon className="h-4 w-4 text-warning shrink-0" />
            <p className="text-sm text-warning">
              {t('gitPanel.create.warnings.noReposSelected')}
            </p>
          </div>
        ) : (
          <SelectedReposList
            repos={repos}
            onRemove={onRepoRemove}
            branchesByRepo={branchesByRepo}
            selectedBranches={targetBranches}
            onBranchChange={onBranchChange}
          />
        )}
      </CollapsibleSectionHeader>
      <CollapsibleSectionHeader
        title={t('common:sections.addRepositories')}
        persistKey={PERSIST_KEYS.gitPanelAddRepositories}
        contentClassName="flex flex-col p-base gap-half"
      >
        <p className="text-xs text-low font-medium">
          {t('common:sections.recent')}
        </p>
        <RecentReposListContainer
          registeredRepoPaths={registeredRepoPaths}
          onRepoRegistered={onRepoRegistered}
        />
        <p className="text-xs text-low font-medium">
          {t('common:sections.other')}
        </p>
        <BrowseRepoButtonContainer onRepoRegistered={onRepoRegistered} />
        <CreateRepoButtonContainer onRepoCreated={onRepoRegistered} />
      </CollapsibleSectionHeader>
    </div>
  );
}
