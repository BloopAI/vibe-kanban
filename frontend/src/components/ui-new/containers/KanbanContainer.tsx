import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { useOrgContext } from '@/contexts/remote/OrgContext';
import { useActions } from '@/contexts/ActionsContext';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import { useKanbanFilters, PRIORITY_ORDER } from '@/hooks/useKanbanFilters';
import { bulkUpdateIssues, type BulkUpdateIssueItem } from '@/lib/remoteApi';
import { useKanbanNavigation } from '@/hooks/useKanbanNavigation';
import { PlusIcon, GearIcon } from '@phosphor-icons/react';
import { Actions } from '@/components/ui-new/actions';
import type { OrganizationMemberWithProfile } from 'shared/types';
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
import { ViewNavTabs } from '@/components/ui-new/primitives/ViewNavTabs';
import { IssueListView } from '@/components/ui-new/views/IssueListView';

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
    projectId,
    issues,
    statuses,
    tags,
    issueAssignees,
    issueTags,
    insertStatus,
    updateStatus,
    removeStatus,
    getTagObjectsForIssue,
    getPullRequestsForIssue,
    isLoading: projectLoading,
  } = useProjectContext();

  const {
    projects,
    membersWithProfilesById,
    isLoading: orgLoading,
  } = useOrgContext();

  // Get project name by finding the project matching current projectId
  const projectName = projects.find((p) => p.id === projectId)?.name ?? '';

  // Apply filters
  const { filteredIssues, hasActiveFilters } = useKanbanFilters({
    issues,
    issueAssignees,
    issueTags,
  });

  // Navigation hook for opening issues and create mode
  const {
    issueId: selectedKanbanIssueId,
    openIssue,
    startCreate,
  } = useKanbanNavigation();

  // Get setter and executor from ActionsContext
  const { setDefaultCreateStatusId, executeAction } = useActions();

  const kanbanFilters = useUiPreferencesStore((s) => s.kanbanFilters);
  const kanbanViewMode = useUiPreferencesStore((s) => s.kanbanViewMode);
  const listViewStatusFilter = useUiPreferencesStore(
    (s) => s.listViewStatusFilter
  );
  const setKanbanViewMode = useUiPreferencesStore((s) => s.setKanbanViewMode);
  const setListViewStatusFilter = useUiPreferencesStore(
    (s) => s.setListViewStatusFilter
  );
  const clearKanbanFilters = useUiPreferencesStore((s) => s.clearKanbanFilters);

  // Reset view mode and filters when navigating between projects
  const prevProjectIdRef = useRef<string | null>(null);

  // Track when drag-drop sync is in progress to prevent flicker
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (
      prevProjectIdRef.current !== null &&
      prevProjectIdRef.current !== projectId
    ) {
      setKanbanViewMode('kanban');
      setListViewStatusFilter(null);
      clearKanbanFilters();
    }
    prevProjectIdRef.current = projectId;
  }, [
    projectId,
    setKanbanViewMode,
    setListViewStatusFilter,
    clearKanbanFilters,
  ]);

  // Sort all statuses for display settings
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  // Filter statuses: visible (non-hidden) for kanban, hidden for tabs
  const visibleStatuses = useMemo(
    () => sortedStatuses.filter((s) => !s.hidden),
    [sortedStatuses]
  );

  // Map status ID to 1-based column index for sort_order calculation
  const statusColumnIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleStatuses.forEach((status, index) => {
      map.set(status.id, index + 1);
    });
    return map;
  }, [visibleStatuses]);

  const hiddenStatuses = useMemo(
    () => sortedStatuses.filter((s) => s.hidden),
    [sortedStatuses]
  );

  // Update default create status for command bar based on current tab
  useEffect(() => {
    let defaultStatusId: string | undefined;
    if (kanbanViewMode === 'kanban') {
      // "Active" tab: first non-hidden status by sort order
      defaultStatusId = visibleStatuses[0]?.id;
    } else if (listViewStatusFilter) {
      // Hidden status tab: use that specific status
      defaultStatusId = listViewStatusFilter;
    } else {
      // "All" tab: first status by sort order
      defaultStatusId = sortedStatuses[0]?.id;
    }
    setDefaultCreateStatusId(defaultStatusId);
  }, [
    kanbanViewMode,
    listViewStatusFilter,
    visibleStatuses,
    sortedStatuses,
    setDefaultCreateStatusId,
  ]);

  // Get statuses to display in list view (all or filtered to one)
  const listViewStatuses = useMemo(() => {
    if (listViewStatusFilter) {
      return sortedStatuses.filter((s) => s.id === listViewStatusFilter);
    }
    return sortedStatuses;
  }, [sortedStatuses, listViewStatusFilter]);

  // Compute issue count by status for display settings
  const issueCountByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const status of statuses) {
      counts[status.id] = issues.filter(
        (i) => i.status_id === status.id
      ).length;
    }
    return counts;
  }, [statuses, issues]);

  // Track items as arrays of IDs grouped by status
  const [items, setItems] = useState<Record<string, string[]>>({});

  // Sync items from filtered issues when they change
  useEffect(() => {
    // Skip rebuild during drag-drop sync to prevent flicker
    if (isSyncingRef.current) {
      return;
    }

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
              (a.priority ? PRIORITY_ORDER[a.priority] : Infinity) -
              (b.priority ? PRIORITY_ORDER[b.priority] : Infinity);
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

  // Create a lookup map for issue assignees (issue_id -> OrganizationMemberWithProfile[])
  const issueAssigneesMap = useMemo(() => {
    const map: Record<string, OrganizationMemberWithProfile[]> = {};
    for (const assignee of issueAssignees) {
      const member = membersWithProfilesById.get(assignee.user_id);
      if (member) {
        if (!map[assignee.issue_id]) {
          map[assignee.issue_id] = [];
        }
        map[assignee.issue_id].push(member);
      }
    }
    return map;
  }, [issueAssignees, membersWithProfilesById]);

  // Calculate sort_order based on column index and issue position
  // Formula: 1000 * [COLUMN_INDEX] + [ISSUE_INDEX] (both 1-based)
  const calculateSortOrder = useCallback(
    (statusId: string, issueIndex: number): number => {
      const columnIndex = statusColumnIndexMap.get(statusId) ?? 1;
      return 1000 * columnIndex + (issueIndex + 1);
    },
    [statusColumnIndexMap]
  );

  // Simple onDragEnd handler - the library handles all visual movement
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination } = result;

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
      const isCrossColumn = sourceId !== destId;

      // Update local state and capture new items for bulk update
      let newItems: Record<string, string[]> = {};
      setItems((prev) => {
        const sourceItems = [...(prev[sourceId] ?? [])];
        const [moved] = sourceItems.splice(source.index, 1);

        if (!isCrossColumn) {
          // Within-column reorder
          sourceItems.splice(destination.index, 0, moved);
          newItems = { ...prev, [sourceId]: sourceItems };
        } else {
          // Cross-column move
          const destItems = [...(prev[destId] ?? [])];
          destItems.splice(destination.index, 0, moved);
          newItems = {
            ...prev,
            [sourceId]: sourceItems,
            [destId]: destItems,
          };
        }
        return newItems;
      });

      // Build bulk updates for all issues in affected columns
      const updates: BulkUpdateIssueItem[] = [];

      // Always update destination column
      const destIssueIds = newItems[destId] ?? [];
      destIssueIds.forEach((issueId, index) => {
        updates.push({
          id: issueId,
          changes: {
            status_id: destId,
            sort_order: calculateSortOrder(destId, index),
          },
        });
      });

      // Update source column if cross-column move
      if (isCrossColumn) {
        const sourceIssueIds = newItems[sourceId] ?? [];
        sourceIssueIds.forEach((issueId, index) => {
          updates.push({
            id: issueId,
            changes: {
              sort_order: calculateSortOrder(sourceId, index),
            },
          });
        });
      }

      // Perform bulk update
      isSyncingRef.current = true;
      bulkUpdateIssues(updates)
        .catch((err) => {
          console.error('Failed to bulk update sort order:', err);
        })
        .finally(() => {
          // Delay clearing flag to let Electric sync complete
          setTimeout(() => {
            isSyncingRef.current = false;
          }, 500);
        });
    },
    [kanbanFilters.sortField, calculateSortOrder]
  );

  const handleCardClick = useCallback(
    (issueId: string) => {
      openIssue(issueId);
    },
    [openIssue]
  );

  const handleAddTask = useCallback(
    (statusId?: string) => {
      startCreate({ statusId });
    },
    [startCreate]
  );

  // Handler for create issue button in ViewNavTabs
  // Determines default status based on current view/tab
  const handleCreateIssueFromNav = useCallback(() => {
    let defaultStatusId: string | undefined;

    if (kanbanViewMode === 'kanban') {
      // "Active" tab: first non-hidden status by sort order
      defaultStatusId = visibleStatuses[0]?.id;
    } else if (listViewStatusFilter) {
      // Hidden status tab: use that specific status
      defaultStatusId = listViewStatusFilter;
    } else {
      // "All" tab: first status by sort order
      defaultStatusId = sortedStatuses[0]?.id;
    }

    startCreate({ statusId: defaultStatusId });
  }, [
    kanbanViewMode,
    listViewStatusFilter,
    visibleStatuses,
    sortedStatuses,
    startCreate,
  ]);

  const isLoading = projectLoading || orgLoading;

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="flex flex-col h-full space-y-base">
      <div className="px-double pt-double space-y-base">
        <div className="flex items-center gap-double">
          <h2 className="text-2xl font-medium">{projectName}</h2>
          <button
            type="button"
            onClick={() => executeAction(Actions.ProjectSettings)}
            className="p-half rounded-sm text-low hover:text-normal hover:bg-secondary transition-colors"
            aria-label="Project settings"
          >
            <GearIcon className="size-icon-xs" weight="bold" />
          </button>
          <ViewNavTabs
            activeView={kanbanViewMode}
            onViewChange={setKanbanViewMode}
            hiddenStatuses={hiddenStatuses}
            selectedStatusId={listViewStatusFilter}
            onStatusSelect={setListViewStatusFilter}
            onCreateIssue={handleCreateIssueFromNav}
          />
        </div>
        <KanbanFilterBar
          tags={tags}
          users={[...membersWithProfilesById.values()]}
          hasActiveFilters={hasActiveFilters}
          statuses={sortedStatuses}
          projectId={projectId}
          issueCountByStatus={issueCountByStatus}
          onInsertStatus={insertStatus}
          onUpdateStatus={updateStatus}
          onRemoveStatus={removeStatus}
        />
      </div>

      {kanbanViewMode === 'kanban' ? (
        visibleStatuses.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-low">{t('kanban.noVisibleStatuses')}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto px-double">
            <KanbanProvider onDragEnd={handleDragEnd}>
              {visibleStatuses.map((status) => {
                const issueIds = items[status.id] ?? [];

                return (
                  <KanbanBoard key={status.id}>
                    <KanbanHeader>
                      <div className="border-t sticky border-b top-0 z-20 flex shrink-0 items-center justify-between gap-2 p-base bg-secondary">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: `hsl(${status.color})` }}
                          />
                          <p className="m-0 text-sm">{status.name}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddTask(status.id)}
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
                              tags={getTagObjectsForIssue(issue.id)}
                              assignees={issueAssigneesMap[issue.id] ?? []}
                              pullRequests={getPullRequestsForIssue(issue.id)}
                              isSubIssue={!!issue.parent_issue_id}
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
        )
      ) : (
        <div className="flex-1 overflow-y-auto px-double">
          <KanbanProvider onDragEnd={handleDragEnd} className="!block !w-full">
            <IssueListView
              statuses={listViewStatuses}
              items={items}
              issueMap={issueMap}
              issueAssigneesMap={issueAssigneesMap}
              getTagObjectsForIssue={getTagObjectsForIssue}
              onIssueClick={handleCardClick}
              selectedIssueId={selectedKanbanIssueId}
            />
          </KanbanProvider>
        </div>
      )}
    </div>
  );
}
