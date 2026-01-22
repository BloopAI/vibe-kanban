import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useEntity } from '@/lib/electric/hooks';
import {
  PROJECT_ENTITY,
  PROJECT_STATUS_ENTITY,
  ISSUE_ENTITY,
} from 'shared/remote-types';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import { PlusIcon } from '@phosphor-icons/react';
import {
  KanbanProvider,
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanCardContent,
  type DropResult,
} from '@/components/ui-new/kanban/Kanban';

function LoadingState() {
  const { t } = useTranslation('common');
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-low">{t('states.loading')}</p>
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
  const { t } = useTranslation('common');
  const { data: statuses, isLoading: statusesLoading } = useEntity(
    PROJECT_STATUS_ENTITY,
    { project_id: projectId }
  );
  const {
    data: issues,
    isLoading: issuesLoading,
    update: updateIssue,
  } = useEntity(ISSUE_ENTITY, {
    project_id: projectId,
  });

  const openKanbanIssuePanel = useUiPreferencesStore(
    (s) => s.openKanbanIssuePanel
  );
  const selectedKanbanIssueId = useUiPreferencesStore(
    (s) => s.selectedKanbanIssueId
  );

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  // Track items as arrays of IDs grouped by status
  const [items, setItems] = useState<Record<string, string[]>>({});

  // Sync items from issues when they change
  useEffect(() => {
    const grouped: Record<string, string[]> = {};
    for (const status of statuses) {
      grouped[status.id] = issues
        .filter((i) => i.status_id === status.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => i.id);
    }
    setItems(grouped);
  }, [issues, statuses]);

  // Create a lookup map for issue data
  const issueMap = useMemo(() => {
    const map: Record<string, (typeof issues)[0]> = {};
    for (const issue of issues) {
      map[issue.id] = issue;
    }
    return map;
  }, [issues]);

  // Simple onDragEnd handler - the library handles all visual movement
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result;

      // Dropped outside a valid droppable
      if (!destination) return;

      // No movement
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return;
      }

      const sourceId = source.droppableId;
      const destId = destination.droppableId;

      // Update local state
      setItems((prev) => {
        const sourceItems = [...(prev[sourceId] ?? [])];
        const [moved] = sourceItems.splice(source.index, 1);

        if (sourceId === destId) {
          // Within-column reorder
          sourceItems.splice(destination.index, 0, moved);
          return { ...prev, [sourceId]: sourceItems };
        } else {
          // Cross-column move
          const destItems = [...(prev[destId] ?? [])];
          destItems.splice(destination.index, 0, moved);
          return {
            ...prev,
            [sourceId]: sourceItems,
            [destId]: destItems,
          };
        }
      });

      // Calculate fractional sort_order from neighbors
      const destIssues = issues
        .filter((i) => i.status_id === destId && i.id !== draggableId)
        .sort((a, b) => a.sort_order - b.sort_order);

      let newSortOrder: number;
      if (destIssues.length === 0) {
        newSortOrder = 1000;
      } else if (destination.index === 0) {
        newSortOrder = destIssues[0].sort_order / 2;
      } else if (destination.index >= destIssues.length) {
        newSortOrder = destIssues[destIssues.length - 1].sort_order + 1000;
      } else {
        const before = destIssues[destination.index - 1].sort_order;
        const after = destIssues[destination.index].sort_order;
        newSortOrder = (before + after) / 2;
      }

      updateIssue(draggableId, {
        status_id: destId,
        sort_order: newSortOrder,
      });
    },
    [updateIssue, issues]
  );

  const handleCardClick = useCallback(
    (issueId: string) => {
      openKanbanIssuePanel(issueId, false);
    },
    [openKanbanIssuePanel]
  );

  const handleAddTask = useCallback(() => {
    openKanbanIssuePanel(null, true);
  }, [openKanbanIssuePanel]);

  // Generate display ID for an issue
  const getDisplayId = useCallback(
    (_issue: (typeof issues)[0], index: number) => {
      return `Task-${(index + 1).toString().padStart(3, '0')}`;
    },
    []
  );

  const isLoading = statusesLoading || issuesLoading;

  if (isLoading) {
    return <LoadingState />;
  }

  if (sortedStatuses.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-low">{t('kanban.noStatusesFound')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-double">
      <h2 className="px-double pt-double text-2xl font-medium">
        {projectName}
      </h2>
      <div className="flex-1 overflow-x-auto px-double">
        <KanbanProvider onDragEnd={handleDragEnd}>
          {sortedStatuses.map((status) => {
            const issueIds = items[status.id] ?? [];

            return (
              <KanbanBoard key={status.id} id={status.id}>
                <KanbanHeader>
                  <div className="sticky border-b top-0 z-20 flex shrink-0 items-center justify-between gap-2 p-base bg-background">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: status.color }}
                      />
                      <p className="m-0 text-sm">{status.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddTask}
                      className="p-half rounded-sm text-low hover:text-normal hover:bg-secondary transition-colors"
                      aria-label="Add task"
                    >
                      <PlusIcon className="size-icon-xs" weight="bold" />
                    </button>
                  </div>
                </KanbanHeader>
                <KanbanCards>
                  {issueIds.map((issueId, index) => {
                    const issue = issueMap[issueId];
                    if (!issue) return null;

                    return (
                      <KanbanCard
                        key={issue.id}
                        id={issue.id}
                        name={issue.title}
                        index={index}
                        onClick={() => handleCardClick(issue.id)}
                        isOpen={selectedKanbanIssueId === issue.id}
                      >
                        <KanbanCardContent
                          displayId={getDisplayId(issue, index)}
                          title={issue.title}
                          description={issue.description}
                          priority={issue.priority}
                          tags={[]}
                          assignee={null}
                        />
                      </KanbanCard>
                    );
                  })}
                  {/* Show sample cards if no real issues */}
                  {issueIds.length === 0 && (
                    <>
                      <KanbanCard
                        id={`sample-1-${status.id}`}
                        name="Add Welcome Modal"
                        index={0}
                        onClick={() => handleAddTask()}
                        dragDisabled
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
                        onClick={() => handleAddTask()}
                        dragDisabled
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
                    </>
                  )}
                </KanbanCards>
              </KanbanBoard>
            );
          })}
        </KanbanProvider>
      </div>
    </div>
  );
}

function KanbanWithProjects({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation('common');
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
        <p className="text-low">{t('kanban.noProjectFound')}</p>
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
  const { t } = useTranslation('common');
  const { data: orgsData, isLoading } = useUserOrganizations();
  const firstOrg = orgsData?.organizations?.[0];

  if (isLoading) {
    return <LoadingState />;
  }

  if (!firstOrg) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-low">{t('kanban.noOrganizationFound')}</p>
      </div>
    );
  }

  return <KanbanWithProjects organizationId={firstOrg.id} />;
}
