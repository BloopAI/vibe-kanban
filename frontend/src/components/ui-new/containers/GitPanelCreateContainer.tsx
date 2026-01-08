import { useMemo, useEffect, useCallback } from 'react';
import { GitPanelCreate } from '@/components/ui-new/views/GitPanelCreate';
import { useMultiRepoBranches } from '@/hooks/useRepoBranches';
import { useProjects } from '@/hooks/useProjects';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { CreateProjectDialog } from '@/components/ui-new/dialogs/CreateProjectDialog';

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
    clearRepos,
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

  const handleCreateProject = useCallback(async () => {
    const result = await CreateProjectDialog.show({});
    if (result.status === 'saved') {
      setSelectedProjectId(result.project.id);
      clearRepos();
    }
  }, [setSelectedProjectId, clearRepos]);

  return (
    <GitPanelCreate
      className={className}
      repos={repos}
      projects={projects}
      selectedProjectId={selectedProjectId}
      selectedProjectName={selectedProject?.name}
      onProjectSelect={(p) => setSelectedProjectId(p.id)}
      onCreateProject={handleCreateProject}
      onRepoRemove={removeRepo}
      branchesByRepo={branchesByRepo}
      targetBranches={targetBranches}
      onBranchChange={setTargetBranch}
      registeredRepoPaths={registeredRepoPaths}
      onRepoRegistered={addRepo}
    />
  );
}
