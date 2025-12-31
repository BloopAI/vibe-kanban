import { useMemo, useEffect } from 'react';
import { GitPanelCreate } from '@/components/ui-new/views/GitPanelCreate';
import { useMultiRepoBranches } from '@/hooks/useRepoBranches';
import { useProjects } from '@/hooks/useProjects';
import { useCreateMode } from '@/contexts/CreateModeContext';

interface GitPanelCreateContainerProps {
  className?: string;
}

export function GitPanelCreateContainer({
  className,
}: GitPanelCreateContainerProps) {
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
    <GitPanelCreate
      className={className}
      repos={repos}
      projects={projects}
      selectedProjectId={selectedProjectId}
      selectedProjectName={selectedProject?.name}
      onProjectSelect={(p) => setSelectedProjectId(p.id)}
      onRepoRemove={removeRepo}
      branchesByRepo={branchesByRepo}
      targetBranches={targetBranches}
      onBranchChange={setTargetBranch}
      registeredRepoPaths={registeredRepoPaths}
      onRepoRegistered={addRepo}
    />
  );
}
