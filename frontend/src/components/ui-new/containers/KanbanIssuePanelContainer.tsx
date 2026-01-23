import { useState, useMemo, useCallback, useEffect } from 'react';
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
    insertIssue,
    updateIssue,
    insertIssueAssignee,
    removeIssueAssignee,
    isLoading: projectLoading,
  } = useProjectContext();

  const { users, isLoading: orgLoading } = useOrgContext();

  // Find selected issue if in edit mode
  const selectedIssue = useMemo(() => {
    if (kanbanCreateMode || !selectedKanbanIssueId) return null;
    return issues.find((i) => i.id === selectedKanbanIssueId) ?? null;
  }, [issues, selectedKanbanIssueId, kanbanCreateMode]);

  // Get all current assignees from issue_assignees
  const currentAssigneeIds = useMemo(() => {
    if (!selectedKanbanIssueId) return [];
    return issueAssignees
      .filter((a) => a.issue_id === selectedKanbanIssueId)
      .map((a) => a.user_id);
  }, [issueAssignees, selectedKanbanIssueId]);

  // Determine mode (only edit when an issue is selected)
  const mode = kanbanCreateMode || !selectedKanbanIssueId ? 'create' : 'edit';

  // Sort statuses by sort_order
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  // Default status (first one by sort order)
  const defaultStatusId = sortedStatuses[0]?.id ?? '';

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

  // Reset form when switching modes or selecting a different issue
  useEffect(() => {
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
        tagIds: [], // Would come from issue_tags table
        createDraftWorkspace: false,
      });
    }
  }, [mode, selectedIssue, defaultStatusId, currentAssigneeIds]);

  // Form change handler - persists changes immediately in edit mode
  const handlePropertyChange = useCallback(
    <K extends keyof IssueFormData>(field: K, value: IssueFormData[K]) => {
      // Always update local form state
      setFormData((prev) => ({ ...prev, [field]: value }));

      // In edit mode, immediately persist to database
      if (!kanbanCreateMode && selectedKanbanIssueId) {
        if (field === 'statusId') {
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
        }
      }
    },
    [
      kanbanCreateMode,
      selectedKanbanIssueId,
      updateIssue,
      issueAssignees,
      insertIssueAssignee,
      removeIssueAssignee,
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
    closeKanbanIssuePanel,
  ]);

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
      workspaces={[]}
      comments={[]}
      linkedPrs={[]}
      onClose={closeKanbanIssuePanel}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      isLoading={isLoading}
    />
  );
}
