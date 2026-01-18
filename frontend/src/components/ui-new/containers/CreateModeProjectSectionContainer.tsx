import { useCallback } from 'react';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { useProjects } from '@/hooks/useProjects';
import { ProjectSelectorContainer } from './ProjectSelectorContainer';
import { CreateProjectDialog } from '@/components/ui-new/dialogs/CreateProjectDialog';

export function CreateModeProjectSectionContainer() {
  const { selectedProjectId, setSelectedProjectId, clearRepos } =
    useCreateMode();
  const { projects } = useProjects();
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleCreateProject = useCallback(async () => {
    const result = await CreateProjectDialog.show({});
    if (result.status === 'saved') {
      setSelectedProjectId(result.project.id);
      clearRepos();
    }
  }, [setSelectedProjectId, clearRepos]);

  return (
    <div className="p-base">
      <ProjectSelectorContainer
        projects={projects}
        selectedProjectId={selectedProjectId}
        selectedProjectName={selectedProject?.name}
        onProjectSelect={(p) => setSelectedProjectId(p.id)}
        onCreateProject={handleCreateProject}
      />
    </div>
  );
}
