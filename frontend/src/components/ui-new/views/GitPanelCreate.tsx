import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/ui-new/primitives/SectionHeader';
import { CollapsibleSection } from '@/components/ui-new/primitives/CollapsibleSection';
import { SelectedReposList } from '@/components/ui-new/primitives/SelectedReposList';
import { SearchableDropdown } from '@/components/ui-new/primitives/SearchableDropdown';
import { DropdownMenuTriggerButton } from '@/components/ui-new/primitives/Dropdown';
import { RecentReposListContainer } from '@/components/ui-new/containers/RecentReposListContainer';
import { BrowseRepoButtonContainer } from '@/components/ui-new/containers/BrowseRepoButtonContainer';
import { CreateRepoButtonContainer } from '@/components/ui-new/containers/CreateRepoButtonContainer';
import { useMultiRepoBranches } from '@/hooks/useRepoBranches';
import { useProjects } from '@/hooks/useProjects';
import { useCreateMode } from '@/contexts/CreateModeContext';

interface GitPanelCreateProps {
  className?: string;
}

export function GitPanelCreate({ className }: GitPanelCreateProps) {
  const {
    repos,
    addRepo,
    removeRepo,
    targetBranches,
    setTargetBranch,
    selectedProjectId,
    setSelectedProjectId,
  } = useCreateMode();
  const { projects } = useProjects();
  const [isAddExpanded, setIsAddExpanded] = useState(true);

  const repoIds = useMemo(() => repos.map((r) => r.id), [repos]);
  const { branchesByRepo } = useMultiRepoBranches(repoIds);

  // Auto-select current branch when branches load
  useEffect(() => {
    repos.forEach((repo) => {
      const branches = branchesByRepo[repo.id];
      if (branches && !targetBranches[repo.id]) {
        const currentBranch = branches.find((b) => b.is_current);
        if (currentBranch) {
          setTargetBranch(repo.id, currentBranch.name);
        }
      }
    });
  }, [repos, branchesByRepo, targetBranches, setTargetBranch]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const registeredRepoPaths = useMemo(() => repos.map((r) => r.path), [repos]);

  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col gap-double pt-double px-double text-low overflow-y-auto',
        className
      )}
    >
      <SectionHeader title="Project" />
      <SearchableDropdown
        items={projects}
        selectedValue={selectedProjectId}
        getItemKey={(p) => p.id}
        getItemLabel={(p) => p.name}
        onSelect={(p) => setSelectedProjectId(p.id)}
        trigger={
          <DropdownMenuTriggerButton
            label={selectedProject?.name ?? 'Select project'}
          />
        }
        placeholder="Search projects..."
        emptyMessage="No projects found"
      />

      <SectionHeader title="Repositories" />

      <SelectedReposList
        repos={repos}
        onRemove={removeRepo}
        branchesByRepo={branchesByRepo}
        selectedBranches={targetBranches}
        onBranchChange={setTargetBranch}
      />

      <CollapsibleSection
        title="Add Repository"
        expanded={isAddExpanded}
        onToggle={() => setIsAddExpanded(!isAddExpanded)}
        className="gap-base"
      >
        <p className="text-xs text-low font-medium">Recent</p>
        <RecentReposListContainer
          registeredRepoPaths={registeredRepoPaths}
          onRepoRegistered={addRepo}
        />
        <p className="text-xs text-low font-medium">Other</p>
        <BrowseRepoButtonContainer onRepoRegistered={addRepo} />
        <CreateRepoButtonContainer onRepoCreated={addRepo} />
      </CollapsibleSection>
    </div>
  );
}
