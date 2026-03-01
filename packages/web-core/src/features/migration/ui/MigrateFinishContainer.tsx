import { useMemo } from 'react';
import { useProjects } from '../model/hooks/useProjects';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import {
  MigrateFinish,
  type MigrateFinishProject,
} from '@vibe/ui/components/MigrateFinish';

interface MigrateFinishContainerProps {
  orgId: string;
  projectIds: string[];
  onMigrateMore: () => void;
}

export function MigrateFinishContainer({
  orgId,
  projectIds,
  onMigrateMore,
}: MigrateFinishContainerProps) {
  const appNavigation = useAppNavigation();
  const { projects } = useProjects();

  const migratedProjects = useMemo(() => {
    return projectIds
      .map((id) => projects.find((p) => p.id === id))
      .filter((p) => p !== undefined)
      .map((p) => ({
        localId: p.id,
        localName: p.name,
        remoteId: p.remote_project_id,
      }));
  }, [projectIds, projects]);

  const handleViewProject = (project: MigrateFinishProject) => {
    if (project.remoteId) {
      appNavigation.navigate(
        appNavigation.toProject(project.remoteId, { orgId })
      );
      return;
    }

    appNavigation.navigate(appNavigation.toWorkspaces());
  };

  return (
    <MigrateFinish
      migratedProjects={migratedProjects}
      onMigrateMore={onMigrateMore}
      onViewProject={handleViewProject}
    />
  );
}
