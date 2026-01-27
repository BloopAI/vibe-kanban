import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { useOrgContext } from '@/contexts/remote/OrgContext';
import { type IssuePriority } from 'shared/remote-types';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import {
  KanbanIssuePanel,
  type IssueFormData,
} from '@/components/ui-new/views/KanbanIssuePanel';
import { useActions } from '@/contexts/ActionsContext';

/**
 * KanbanIssuePanelContainer manages the issue detail/create panel.
 * Uses ProjectContext and OrgContext for data and mutations.
 * Must be rendered within both OrgProvider and ProjectProvider.
 */
export function KanbanIssuePanelContainer() {
  const selectedKanbanIssueId = useUiPreferencesStore(
    (s) => s.selectedKanbanIssueId
  );
  const kanbanCreateMode = useUiPreferencesStore((s) => s.kanbanCreateMode);
  const closeKanbanIssuePanel = useUiPreferencesStore(
    (s) => s.closeKanbanIssuePanel
  );

  // Get data from contexts
  const {
    projectId,
    issues,
    statuses,
    tags,
    issueAssignees,
    issueTags,
    insertIssue,
    updateIssue,
    insertIssueAssignee,
    removeIssueAssignee,
    insertIssueTag,
    removeIssueTag,
    insertTag,
    getTagsForIssue,
    isLoading: projectLoading,
  } = useProjectContext();

  const { users, isLoading: orgLoading } = useOrgContext();

  // Get openStatusSelection from actions context
  const { openStatusSelection } = useActions();

  // Close panel if selected issue doesn't exist in current project (e.g., stale persisted state)
  useEffect(() => {
    // Wait for data to load
    if (projectLoading || orgLoading) return;

    // Only check in edit mode (when an issue should be selected)
    if (kanbanCreateMode || !selectedKanbanIssueId) return;

    // If the selected issue doesn't exist in this project, close the panel
    const issueExists = issues.some((i) => i.id === selectedKanbanIssueId);
    if (!issueExists) {
      closeKanbanIssuePanel();
    }
  }, [
    projectLoading,
    orgLoading,
    kanbanCreateMode,
    selectedKanbanIssueId,
    issues,
    closeKanbanIssuePanel,
  ]);

  // Find selected issue if in edit mode
  const selectedIssue = useMemo(() => {
    if (kanbanCreateMode || !selectedKanbanIssueId) return null;
    return issues.find((i) => i.id === selectedKanbanIssueId) ?? null;
  }, [issues, selectedKanbanIssueId, kanbanCreateMode]);

  // Find parent issue if current issue has one
  const parentIssue = useMemo(() => {
    if (!selectedIssue?.parent_issue_id) return null;
    const parent = issues.find((i) => i.id === selectedIssue.parent_issue_id);
    if (!parent) return null;
    return { id: parent.id, simpleId: parent.simple_id };
  }, [issues, selectedIssue]);

  const openKanbanIssuePanel = useUiPreferencesStore(
    (s) => s.openKanbanIssuePanel
  );

  // Handler for clicking on parent issue
  const handleParentIssueClick = useCallback(() => {
    if (parentIssue) {
      openKanbanIssuePanel(parentIssue.id);
    }
  }, [parentIssue, openKanbanIssuePanel]);

  // Get all current assignees from issue_assignees
  const currentAssigneeIds = useMemo(() => {
    if (!selectedKanbanIssueId) return [];
    return issueAssignees
      .filter((a) => a.issue_id === selectedKanbanIssueId)
      .map((a) => a.user_id);
  }, [issueAssignees, selectedKanbanIssueId]);

  // Get current tag IDs from issue_tags junction table
  const currentTagIds = useMemo(() => {
    if (!selectedKanbanIssueId) return [];
    const tagLinks = getTagsForIssue(selectedKanbanIssueId);
    return tagLinks.map((it) => it.tag_id);
  }, [getTagsForIssue, selectedKanbanIssueId]);

  // Determine mode (only edit when an issue is selected)
  const mode = kanbanCreateMode || !selectedKanbanIssueId ? 'create' : 'edit';

  // Sort statuses by sort_order
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  // Default status (first one by sort order)
  const defaultStatusId = sortedStatuses[0]?.id ?? '';

  // Track previous issue ID to detect actual issue switches (not just data updates)
  const prevIssueIdRef = useRef<string | null>(null);

  // Display ID: use real simple_id in edit mode, placeholder for create mode
  const displayId = useMemo(() => {
    if (mode === 'edit' && selectedIssue) {
      return selectedIssue.simple_id;
    }
    return 'New Issue';
  }, [mode, selectedIssue]);

  // For create mode - full local state needed
  const [createFormData, setCreateFormData] = useState<IssueFormData | null>(
    null
  );

  // For edit mode - only track text field edits (title, description)
  // Dropdown fields (status, priority, assignees, tags) derive from server state
  // When null, no local edits exist; values are read from server state
  const [localTextEdits, setLocalTextEdits] = useState<{
    title: string | null;
    description: string | null;
  } | null>(null);

  // Compute display values based on mode
  // - Create mode: use createFormData
  // - Edit mode: text fields from localTextEdits (if editing) or server, dropdown fields always from server
  const displayData = useMemo((): IssueFormData => {
    if (mode === 'create') {
      return (
        createFormData ?? {
          title: '',
          description: null,
          statusId: defaultStatusId,
          priority: 'medium',
          assigneeIds: [],
          tagIds: [],
          createDraftWorkspace: false,
        }
      );
    }

    // Edit mode: dropdown fields from server, text fields from local edits or server
    return {
      title:
        localTextEdits && localTextEdits.title !== null
          ? localTextEdits.title
          : (selectedIssue?.title ?? ''),
      description:
        localTextEdits && localTextEdits.description !== null
          ? localTextEdits.description
          : (selectedIssue?.description ?? null),
      statusId: selectedIssue?.status_id ?? '', // Always from server
      priority: selectedIssue?.priority ?? 'medium', // Always from server
      assigneeIds: currentAssigneeIds, // Always from server
      tagIds: currentTagIds, // Always from server
      createDraftWorkspace: false,
    };
  }, [
    mode,
    createFormData,
    localTextEdits,
    selectedIssue,
    defaultStatusId,
    currentAssigneeIds,
    currentTagIds,
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Save status for description (shown in WYSIWYG toolbar)
  const [descriptionSaveStatus, setDescriptionSaveStatus] = useState<
    'idle' | 'saved'
  >('idle');

  // Debounced save for title changes
  const { debounced: debouncedSaveTitle, cancel: cancelDebouncedTitle } =
    useDebouncedCallback((title: string) => {
      if (selectedKanbanIssueId && !kanbanCreateMode) {
        updateIssue(selectedKanbanIssueId, { title });
      }
    }, 500);

  // Debounced save for description changes
  const {
    debounced: debouncedSaveDescription,
    cancel: cancelDebouncedDescription,
  } = useDebouncedCallback((description: string | null) => {
    if (selectedKanbanIssueId && !kanbanCreateMode) {
      updateIssue(selectedKanbanIssueId, { description });
      setDescriptionSaveStatus('saved');
      setTimeout(() => setDescriptionSaveStatus('idle'), 1500);
    }
  }, 500);

  // Reset save status only when switching to a different issue or mode
  useEffect(() => {
    setDescriptionSaveStatus('idle');
  }, [selectedKanbanIssueId, kanbanCreateMode]);

  // Reset local state when switching issues or modes
  useEffect(() => {
    const currentIssueId = selectedKanbanIssueId;
    const isNewIssue = currentIssueId !== prevIssueIdRef.current;

    if (!isNewIssue) {
      // Same issue - no reset needed
      // (dropdown fields derive from server state, text fields preserve local edits)
      return;
    }

    // Track the new issue ID
    prevIssueIdRef.current = currentIssueId;

    // Cancel any pending debounced saves when switching issues
    cancelDebouncedTitle();
    cancelDebouncedDescription();

    // Clear local text edits (they apply to the previous issue)
    setLocalTextEdits(null);

    // Initialize create form data if in create mode
    if (mode === 'create') {
      setCreateFormData({
        title: '',
        description: null,
        statusId: defaultStatusId,
        priority: 'medium',
        assigneeIds: [],
        tagIds: [],
        createDraftWorkspace: false,
      });
    } else {
      // Edit mode: clear createFormData, displayData will derive from selectedIssue
      setCreateFormData(null);
    }
  }, [
    mode,
    selectedKanbanIssueId,
    defaultStatusId,
    cancelDebouncedTitle,
    cancelDebouncedDescription,
  ]);

  // Form change handler - persists changes immediately in edit mode
  const handlePropertyChange = useCallback(
    <K extends keyof IssueFormData>(field: K, value: IssueFormData[K]) => {
      // Create mode: update createFormData for all fields
      if (kanbanCreateMode || !selectedKanbanIssueId) {
        setCreateFormData((prev) =>
          prev ? { ...prev, [field]: value } : null
        );
        return;
      }

      // Edit mode: handle text fields vs dropdown fields differently
      if (field === 'title') {
        // Text field: update local state, then debounced save
        setLocalTextEdits((prev) => ({
          title: value as string,
          description: prev?.description ?? null,
        }));
        debouncedSaveTitle(value as string);
      } else if (field === 'description') {
        // Text field: update local state, then debounced save
        setLocalTextEdits((prev) => ({
          title: prev?.title ?? null,
          description: value as string | null,
        }));
        debouncedSaveDescription(value as string | null);
      } else if (field === 'statusId') {
        // Status changes go through the command bar status selection
        openStatusSelection(projectId, [selectedKanbanIssueId]);
      } else if (field === 'priority') {
        // Dropdown field: persist immediately
        updateIssue(selectedKanbanIssueId, {
          priority: value as IssuePriority,
        });
      } else if (field === 'assigneeIds') {
        // Handle assignee changes via junction table
        const newIds = value as string[];
        const currentIds = issueAssignees
          .filter((a) => a.issue_id === selectedKanbanIssueId)
          .map((a) => a.user_id);

        // Remove assignees no longer selected
        issueAssignees
          .filter(
            (a) =>
              a.issue_id === selectedKanbanIssueId &&
              !newIds.includes(a.user_id)
          )
          .forEach((a) => removeIssueAssignee(a.id));

        // Add new assignees
        newIds
          .filter((id) => !currentIds.includes(id))
          .forEach((userId) =>
            insertIssueAssignee({
              issue_id: selectedKanbanIssueId,
              user_id: userId,
            })
          );
      } else if (field === 'tagIds') {
        // Handle tag changes via junction table
        const newTagIds = value as string[];
        const currentIssueTags = issueTags.filter(
          (it) => it.issue_id === selectedKanbanIssueId
        );
        const currentTagIdSet = new Set(
          currentIssueTags.map((it) => it.tag_id)
        );
        const newTagIdSet = new Set(newTagIds);

        // Remove tags that are no longer selected
        for (const issueTag of currentIssueTags) {
          if (!newTagIdSet.has(issueTag.tag_id)) {
            removeIssueTag(issueTag.id);
          }
        }

        // Add newly selected tags
        for (const tagId of newTagIds) {
          if (!currentTagIdSet.has(tagId)) {
            insertIssueTag({
              issue_id: selectedKanbanIssueId,
              tag_id: tagId,
            });
          }
        }
      }
    },
    [
      kanbanCreateMode,
      selectedKanbanIssueId,
      projectId,
      updateIssue,
      debouncedSaveTitle,
      debouncedSaveDescription,
      openStatusSelection,
      issueAssignees,
      insertIssueAssignee,
      removeIssueAssignee,
      issueTags,
      insertIssueTag,
      removeIssueTag,
    ]
  );

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!displayData.title.trim()) return;

    setIsSubmitting(true);
    try {
      if (mode === 'create') {
        // Create new issue
        const maxSortOrder = Math.max(
          ...issues
            .filter((i) => i.status_id === displayData.statusId)
            .map((i) => i.sort_order),
          0
        );

        const newIssue = insertIssue({
          project_id: projectId,
          status_id: displayData.statusId,
          title: displayData.title,
          description: displayData.description,
          priority: displayData.priority,
          sort_order: maxSortOrder + 1,
          start_date: null,
          target_date: null,
          completed_at: null,
          parent_issue_id: null,
          extension_metadata: null,
        });

        // Create assignee records for all selected assignees
        displayData.assigneeIds.forEach((userId) => {
          insertIssueAssignee({
            issue_id: newIssue.id,
            user_id: userId,
          });
        });

        // Create tag records if tags were selected
        for (const tagId of displayData.tagIds) {
          insertIssueTag({
            issue_id: newIssue.id,
            tag_id: tagId,
          });
        }

        // TODO: Create workspace if displayData.createDraftWorkspace is true

        closeKanbanIssuePanel();
      } else {
        // Update existing issue - would use update mutation
        // For now, just close the panel
        closeKanbanIssuePanel();
      }
    } catch (error) {
      console.error('Failed to save issue:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    mode,
    displayData,
    projectId,
    issues,
    insertIssue,
    insertIssueAssignee,
    insertIssueTag,
    closeKanbanIssuePanel,
  ]);

  // Tag create callback - returns the new tag ID so it can be auto-selected
  const handleCreateTag = useCallback(
    (data: { name: string; color: string }): string => {
      const newTag = insertTag({
        project_id: projectId,
        name: data.name,
        color: data.color,
      });
      return newTag.id;
    },
    [insertTag, projectId]
  );

  // Loading state
  const isLoading = projectLoading || orgLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-secondary">
        <p className="text-low">Loading...</p>
      </div>
    );
  }

  return (
    <KanbanIssuePanel
      mode={mode}
      displayId={displayId}
      formData={displayData}
      onFormChange={handlePropertyChange}
      statuses={sortedStatuses}
      tags={tags}
      users={users}
      issueId={selectedKanbanIssueId}
      parentIssue={parentIssue}
      onParentIssueClick={handleParentIssueClick}
      workspaces={[]}
      linkedPrs={[]}
      onClose={closeKanbanIssuePanel}
      onSubmit={handleSubmit}
      onCreateTag={handleCreateTag}
      isSubmitting={isSubmitting}
      isLoading={isLoading}
      descriptionSaveStatus={
        mode === 'edit' ? descriptionSaveStatus : undefined
      }
    />
  );
}
