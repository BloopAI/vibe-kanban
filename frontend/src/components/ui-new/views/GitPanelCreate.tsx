import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/ui-new/primitives/SectionHeader';
import { SelectedReposList } from '@/components/ui-new/primitives/SelectedReposList';
import { ProjectSelectorContainer } from '@/components/ui-new/containers/ProjectSelectorContainer';
import { RecentReposListContainer } from '@/components/ui-new/containers/RecentReposListContainer';
import { BrowseRepoButtonContainer } from '@/components/ui-new/containers/BrowseRepoButtonContainer';
import { CreateRepoButtonContainer } from '@/components/ui-new/containers/CreateRepoButtonContainer';
import { WarningIcon } from '@phosphor-icons/react';
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
  const hasNoRepos = repos.length === 0;

  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col text-low overflow-y-auto',
        className
      )}
    >
      <SectionHeader title="Project" />
      <div className="p-base border-b">
        <ProjectSelectorContainer
          projects={projects}
          selectedProjectId={selectedProjectId}
          selectedProjectName={selectedProjectName}
          onProjectSelect={onProjectSelect}
          onCreateProject={onCreateProject}
        />
      </div>

      <SectionHeader title="Repositories" />
      <div className="p-base border-b">
        {hasNoRepos ? (
          <div className="flex items-center gap-2 p-base rounded bg-warning/10 border border-warning/20">
            <WarningIcon className="h-4 w-4 text-warning shrink-0" />
            <p className="text-sm text-warning">
              Please select at least one repository to get started
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
      </div>
      <SectionHeader title="Add Repositories" />
      <div className="flex flex-col p-base gap-half">
        <p className="text-xs text-low font-medium">Recent</p>
        <RecentReposListContainer
          registeredRepoPaths={registeredRepoPaths}
          onRepoRegistered={onRepoRegistered}
        />
        <p className="text-xs text-low font-medium">Other</p>
        <BrowseRepoButtonContainer onRepoRegistered={onRepoRegistered} />
        <CreateRepoButtonContainer onRepoCreated={onRepoRegistered} />
      </div>
    </div>
  );
}
