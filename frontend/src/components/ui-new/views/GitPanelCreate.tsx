import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/ui-new/primitives/SectionHeader';
import { CollapsibleSection } from '@/components/ui-new/primitives/CollapsibleSection';
import { SelectedReposList } from '@/components/ui-new/primitives/SelectedReposList';
import { SearchableDropdownContainer } from '@/components/ui-new/containers/SearchableDropdownContainer';
import { DropdownMenuTriggerButton } from '@/components/ui-new/primitives/Dropdown';
import { RecentReposListContainer } from '@/components/ui-new/containers/RecentReposListContainer';
import { BrowseRepoButtonContainer } from '@/components/ui-new/containers/BrowseRepoButtonContainer';
import { CreateRepoButtonContainer } from '@/components/ui-new/containers/CreateRepoButtonContainer';
import { PERSIST_KEYS } from '@/stores/useUiPreferencesStore';
import type { Project, GitBranch } from 'shared/types';

interface RepoInfo {
  id: string;
  path: string;
}

interface GitPanelCreateProps {
  className?: string;
  repos: RepoInfo[];
  projects: Project[];
  selectedProjectId: string | null;
  selectedProjectName?: string;
  onProjectSelect: (project: Project) => void;
  onRepoRemove: (repoId: string) => void;
  branchesByRepo: Record<string, GitBranch[]>;
  targetBranches: Record<string, string>;
  onBranchChange: (repoId: string, branch: string) => void;
  registeredRepoPaths: string[];
  onRepoRegistered: (repo: RepoInfo) => void;
}

export function GitPanelCreate({
  className,
  repos,
  projects,
  selectedProjectId,
  selectedProjectName,
  onProjectSelect,
  onRepoRemove,
  branchesByRepo,
  targetBranches,
  onBranchChange,
  registeredRepoPaths,
  onRepoRegistered,
}: GitPanelCreateProps) {
  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col gap-double pt-double px-double text-low overflow-y-auto',
        className
      )}
    >
      <SectionHeader title="Project" />
      <SearchableDropdownContainer
        items={projects}
        selectedValue={selectedProjectId}
        getItemKey={(p) => p.id}
        getItemLabel={(p) => p.name}
        onSelect={onProjectSelect}
        trigger={
          <DropdownMenuTriggerButton
            label={selectedProjectName ?? 'Select project'}
          />
        }
        placeholder="Search projects..."
        emptyMessage="No projects found"
      />

      <SectionHeader title="Repositories" />

      <SelectedReposList
        repos={repos}
        onRemove={onRepoRemove}
        branchesByRepo={branchesByRepo}
        selectedBranches={targetBranches}
        onBranchChange={onBranchChange}
      />

      <CollapsibleSection
        persistKey={PERSIST_KEYS.gitPanelCreateAddRepo}
        title="Add Repository"
        className="gap-base"
      >
        <p className="text-xs text-low font-medium">Recent</p>
        <RecentReposListContainer
          registeredRepoPaths={registeredRepoPaths}
          onRepoRegistered={onRepoRegistered}
        />
        <p className="text-xs text-low font-medium">Other</p>
        <BrowseRepoButtonContainer onRepoRegistered={onRepoRegistered} />
        <CreateRepoButtonContainer onRepoCreated={onRepoRegistered} />
      </CollapsibleSection>
    </div>
  );
}
