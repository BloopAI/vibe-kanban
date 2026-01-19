import { useMemo } from 'react';
import {
  useElectricCollection,
  PROJECT_STATUSES_SHAPE,
  PROJECTS_SHAPE,
} from '@/lib/electric';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import {
  KanbanProvider,
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  type DragEndEvent,
} from '@/components/ui/shadcn-io/kanban';

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-low">Loading kanban board...</p>
    </div>
  );
}

function KanbanBoardContent({ projectId }: { projectId: string }) {
  const { data: statuses, isLoading } = useElectricCollection(
    PROJECT_STATUSES_SHAPE,
    { project_id: projectId }
  );

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    console.log('Drag ended:', event);
  };

  if (isLoading) {
    return <LoadingState />;
  }

  if (sortedStatuses.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-low">No statuses found for this project</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto">
      <KanbanProvider onDragEnd={handleDragEnd}>
        {sortedStatuses.map((status) => (
          <KanbanBoard key={status.id} id={status.id}>
            <KanbanHeader name={status.name} color={status.color} />
            <KanbanCards>
              <KanbanCard
                id={`placeholder-${status.id}`}
                name="Placeholder card"
                index={0}
                parent={status.id}
              />
            </KanbanCards>
          </KanbanBoard>
        ))}
      </KanbanProvider>
    </div>
  );
}

function KanbanWithProjects({ organizationId }: { organizationId: string }) {
  const { data: projects, isLoading } = useElectricCollection(PROJECTS_SHAPE, {
    organization_id: organizationId,
  });
  const firstProject = projects?.[0];

  if (isLoading) {
    return <LoadingState />;
  }

  if (!firstProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-low">No project found</p>
      </div>
    );
  }

  return <KanbanBoardContent projectId={firstProject.id} />;
}

export function KanbanContainer() {
  const { data: orgsData, isLoading } = useUserOrganizations();
  const firstOrg = orgsData?.organizations?.[0];

  if (isLoading) {
    return <LoadingState />;
  }

  if (!firstOrg) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-low">No organization found</p>
      </div>
    );
  }

  return <KanbanWithProjects organizationId={firstOrg.id} />;
}
