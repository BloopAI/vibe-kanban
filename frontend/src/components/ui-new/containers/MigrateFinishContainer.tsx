import { useMemo } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { MigrateFinish } from '@/components/ui-new/views/MigrateFinish';

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

  return (
    <MigrateFinish
      orgId={orgId}
      migratedProjects={migratedProjects}
      onMigrateMore={onMigrateMore}
    />
  );
}
