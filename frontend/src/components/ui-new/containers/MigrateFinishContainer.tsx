import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { MigrateFinish } from '@/components/ui-new/views/MigrateFinish';

interface MigrateFinishContainerProps {
  projectIds: string[];
  onMigrateMore: () => void;
}

export function MigrateFinishContainer({
  projectIds,
  onMigrateMore,
}: MigrateFinishContainerProps) {
  const navigate = useNavigate();
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

  const handleClose = () => {
    // Navigate to the projects list
    navigate('/local-projects');
  };

  return (
    <MigrateFinish
      migratedProjects={migratedProjects}
      onMigrateMore={onMigrateMore}
      onClose={handleClose}
    />
  );
}
