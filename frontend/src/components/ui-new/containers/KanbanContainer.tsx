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

export function KanbanContainer() {
  // 1. Get first organization
  const { data: orgsData, isLoading: orgsLoading } = useUserOrganizations();
  const firstOrg = orgsData?.organizations?.[0];

  // 2. Get first project from that org
  const { data: projects, isLoading: projectsLoading } = useElectricCollection(
    PROJECTS_SHAPE,
    { organization_id: firstOrg?.id ?? '' }
  );
  const firstProject = projects?.[0];

  // 3. Fetch project statuses (kanban columns)
  const { data: statuses, isLoading: statusesLoading } = useElectricCollection(
    PROJECT_STATUSES_SHAPE,
    { project_id: firstProject?.id ?? '' }
  );

  // Sort statuses by sort_order
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  // Handle drag end (placeholder - no actual reordering yet)
  const handleDragEnd = (event: DragEndEvent) => {
    console.log('Drag ended:', event);
  };

  // Loading state
  const isLoading = orgsLoading || projectsLoading || statusesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-low">Loading kanban board...</p>
      </div>
    );
  }

  if (!firstOrg || !firstProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-low">No project found</p>
      </div>
    );
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
              {/* Placeholder cards for now */}
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
