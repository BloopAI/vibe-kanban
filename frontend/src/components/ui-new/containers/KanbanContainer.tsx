import { useMemo } from 'react';
import { useEntity } from '@/lib/electric/hooks';
import { PROJECT_ENTITY, PROJECT_STATUS_ENTITY } from 'shared/remote-types';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import {
  KanbanProvider,
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanCardContent,
  type DragEndEvent,
} from '@/components/ui-new/kanban/Kanban';

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-low">Loading kanban board...</p>
    </div>
  );
}

function KanbanBoardContent({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const { data: statuses, isLoading } = useEntity(PROJECT_STATUS_ENTITY, {
    project_id: projectId,
  });

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
    <div className="flex flex-col h-full">
      <h2 className="px-double pt-double text-lg font-medium">{projectName}</h2>
      <div className="flex-1 overflow-x-auto p-double pt-base">
        <KanbanProvider onDragEnd={handleDragEnd}>
          {sortedStatuses.map((status) => (
            <KanbanBoard key={status.id} id={status.id}>
              <KanbanHeader>
                <div className="sticky top-0 z-20 flex shrink-0 items-center gap-2 p-3 border-b border-dashed bg-background">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: status.color }}
                  />
                  <p className="m-0 text-sm">{status.name}</p>
                </div>
              </KanbanHeader>
              <KanbanCards>
                <KanbanCard
                  id={`sample-1-${status.id}`}
                  name="Add Welcome Modal"
                  index={0}
                  parent={status.id}
                >
                  <KanbanCardContent
                    displayId="Task-001"
                    title="Add Welcome Modal"
                    description="Goal: to successfully on-board a user onto Vibe Kanban in a few clicks as possible"
                    priority="urgent"
                    tags={[
                      { id: '1', name: 'On-boarding' },
                      { id: '2', name: 'Front-end' },
                    ]}
                    assignee={null}
                  />
                </KanbanCard>
                <KanbanCard
                  id={`sample-2-${status.id}`}
                  name="Setup CI Pipeline"
                  index={1}
                  parent={status.id}
                >
                  <KanbanCardContent
                    displayId="Task-002"
                    title="Setup CI Pipeline"
                    description="Configure GitHub Actions for automated testing and deployment"
                    priority="low"
                    tags={[{ id: '3', name: 'DevOps' }]}
                    assignee={{
                      firstName: 'Schnitzel',
                      lastName: 'Boy',
                      username: 'schnitzelboy',
                    }}
                    isLoading
                  />
                </KanbanCard>
              </KanbanCards>
            </KanbanBoard>
          ))}
        </KanbanProvider>
      </div>
    </div>
  );
}

function KanbanWithProjects({ organizationId }: { organizationId: string }) {
  const { data: projects, isLoading } = useEntity(PROJECT_ENTITY, {
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

  return (
    <KanbanBoardContent
      projectId={firstProject.id}
      projectName={firstProject.name}
    />
  );
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
