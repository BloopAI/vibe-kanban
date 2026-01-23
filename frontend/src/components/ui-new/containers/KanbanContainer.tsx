import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { useOrgContext } from '@/contexts/remote/OrgContext';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import { useKanbanFilters, PRIORITY_ORDER } from '@/hooks/useKanbanFilters';
import { PlusIcon } from '@phosphor-icons/react';
import type { User } from 'shared/remote-types';
import {
  KanbanProvider,
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  type DropResult,
} from '@/components/ui-new/views/KanbanBoard';
import { KanbanCardContent } from '@/components/ui-new/views/KanbanCardContent';
import { KanbanFilterBar } from '@/components/ui-new/views/KanbanFilterBar';

function LoadingState() {
  const { t } = useTranslation('common');
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-low">{t('states.loading')}</p>
    </div>
  );
}

/**
 * KanbanContainer displays the kanban board using data from ProjectContext and OrgContext.
 * Must be rendered within both OrgProvider and ProjectProvider.
 */
export function KanbanContainer() {
  const { t } = useTranslation('common');

  // Get data from contexts (set up by WorkspacesLayout)
  const {
    issues,
    statuses,
    tags,
    issueAssignees,
    issueTags,
    updateIssue,
    isLoading: projectLoading,
  } = useProjectContext();

  const { projects, users, usersById, isLoading: orgLoading } = useOrgContext();

  // Get project name from first project (context provides the project we're viewing)
  const projectName = projects[0]?.name ?? '';

  // Apply filters
  const { filteredIssues, hasActiveFilters } = useKanbanFilters({
    issues,
    issueAssignees,
    issueTags,
  });

  const openKanbanIssuePanel = useUiPreferencesStore(
    (s) => s.openKanbanIssuePanel
  );
  const selectedKanbanIssueId = useUiPreferencesStore(
    (s) => s.selectedKanbanIssueId
  );
  const kanbanFilters = useUiPreferencesStore((s) => s.kanbanFilters);

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  // Track items as arrays of IDs grouped by status
  const [items, setItems] = useState<Record<string, string[]>>({});

  // Sync items from filtered issues when they change
  useEffect(() => {
    const { sortField, sortDirection } = kanbanFilters;
    const grouped: Record<string, string[]> = {};

    for (const status of statuses) {
      // Filter issues for this status
      let statusIssues = filteredIssues.filter(
        (i) => i.status_id === status.id
      );

      // Sort within column based on user preference
      statusIssues = [...statusIssues].sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'priority':
            comparison =
              PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
            break;
          case 'created_at':
            comparison =
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime();
            break;
          case 'updated_at':
            comparison =
              new Date(a.updated_at).getTime() -
              new Date(b.updated_at).getTime();
            break;
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          case 'sort_order':
          default:
            comparison = a.sort_order - b.sort_order;
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });

      grouped[status.id] = statusIssues.map((i) => i.id);
    }
    setItems(grouped);
  }, [filteredIssues, statuses, kanbanFilters]);

  // Create a lookup map for issue data
  const issueMap = useMemo(() => {
    const map: Record<string, (typeof issues)[0]> = {};
    for (const issue of issues) {
      map[issue.id] = issue;
    }
    return map;
  }, [issues]);

  // Create a lookup map for issue assignees (issue_id -> User[])
  const issueAssigneesMap = useMemo(() => {
    const map: Record<string, User[]> = {};
    for (const assignee of issueAssignees) {
      const user = usersById.get(assignee.user_id);
      if (user) {
        if (!map[assignee.issue_id]) {
          map[assignee.issue_id] = [];
        }
        map[assignee.issue_id].push(user);
      }
    }
    return map;
  }, [issueAssignees, usersById]);

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

      const isManualSort = kanbanFilters.sortField === 'sort_order';

      // Block within-column reordering when not in manual sort mode
      // (cross-column moves are always allowed for status changes)
      if (source.droppableId === destination.droppableId && !isManualSort) {
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
    [updateIssue, issues, kanbanFilters.sortField]
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

  const isLoading = projectLoading || orgLoading;

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
    <div className="flex flex-col h-full space-y-base">
      <div className="px-double pt-double space-y-base">
        <h2 className="text-2xl font-medium">{projectName}</h2>
        <KanbanFilterBar
          tags={tags}
          users={users}
          hasActiveFilters={hasActiveFilters}
        />
      </div>
      <div className="flex-1 overflow-x-auto px-double">
        <KanbanProvider onDragEnd={handleDragEnd}>
          {sortedStatuses.map((status) => {
            const issueIds = items[status.id] ?? [];

            return (
              <KanbanBoard key={status.id}>
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
                <KanbanCards id={status.id}>
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
                          displayId={issue.simple_id}
                          title={issue.title}
                          description={issue.description}
                          priority={issue.priority}
                          tags={[]}
                          assignees={issueAssigneesMap[issue.id] ?? []}
                        />
                      </KanbanCard>
                    );
                  })}
                </KanbanCards>
              </KanbanBoard>
            );
          })}
        </KanbanProvider>
      </div>
    </div>
  );
}
