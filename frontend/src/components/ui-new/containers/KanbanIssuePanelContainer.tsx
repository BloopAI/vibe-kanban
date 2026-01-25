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

  // Form state
  const [formData, setFormData] = useState<IssueFormData>(() => ({
    title: '',
    description: null,
    statusId: defaultStatusId,
    priority: 'medium' as IssuePriority,
    assigneeIds: [],
    tagIds: [],
    createDraftWorkspace: false,
  }));

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

  // Reset form only when switching to a different issue (not on data updates)
  useEffect(() => {
    const currentIssueId = selectedKanbanIssueId;
    const isNewIssue = currentIssueId !== prevIssueIdRef.current;

    if (!isNewIssue) {
      // Same issue, don't reset form (this is just a data sync from our own edits)
      return;
    }

    // Track the new issue ID
    prevIssueIdRef.current = currentIssueId;

    // Cancel any pending debounced saves when switching issues
    cancelDebouncedTitle();
    cancelDebouncedDescription();

    if (mode === 'create') {
      setFormData({
        title: '',
        description: null,
        statusId: defaultStatusId,
        priority: 'medium',
        assigneeIds: [],
        tagIds: [],
        createDraftWorkspace: false,
      });
    } else if (selectedIssue) {
      setFormData({
        title: selectedIssue.title,
        description: selectedIssue.description,
        statusId: selectedIssue.status_id,
        priority: selectedIssue.priority,
        assigneeIds: currentAssigneeIds,
        tagIds: currentTagIds,
        createDraftWorkspace: false,
      });
    }
  }, [
    mode,
    selectedKanbanIssueId,
    selectedIssue,
    defaultStatusId,
    currentAssigneeIds,
    currentTagIds,
    cancelDebouncedTitle,
    cancelDebouncedDescription,
  ]);

  // Form change handler - persists changes immediately in edit mode
  const handlePropertyChange = useCallback(
    <K extends keyof IssueFormData>(field: K, value: IssueFormData[K]) => {
      // Always update local form state
      setFormData((prev) => ({ ...prev, [field]: value }));

      // In edit mode, immediately persist to database
      if (!kanbanCreateMode && selectedKanbanIssueId) {
        if (field === 'title') {
          debouncedSaveTitle(value as string);
        } else if (field === 'description') {
          debouncedSaveDescription(value as string | null);
        } else if (field === 'statusId') {
          updateIssue(selectedKanbanIssueId, { status_id: value as string });
        } else if (field === 'priority') {
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
      }
    },
    [
      kanbanCreateMode,
      selectedKanbanIssueId,
      updateIssue,
      debouncedSaveTitle,
      debouncedSaveDescription,
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
    if (!formData.title.trim()) return;

    setIsSubmitting(true);
    try {
      if (mode === 'create') {
        // Create new issue
        const maxSortOrder = Math.max(
          ...issues
            .filter((i) => i.status_id === formData.statusId)
            .map((i) => i.sort_order),
          0
        );

        const newIssue = insertIssue({
          project_id: projectId,
          status_id: formData.statusId,
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          sort_order: maxSortOrder + 1,
          start_date: null,
          target_date: null,
          completed_at: null,
          parent_issue_id: null,
          extension_metadata: null,
        });

        // Create assignee records for all selected assignees
        formData.assigneeIds.forEach((userId) => {
          insertIssueAssignee({
            issue_id: newIssue.id,
            user_id: userId,
          });
        });

        // Create tag records if tags were selected
        for (const tagId of formData.tagIds) {
          insertIssueTag({
            issue_id: newIssue.id,
            tag_id: tagId,
          });
        }

        // TODO: Create workspace if formData.createDraftWorkspace is true

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
    formData,
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
      formData={formData}
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
