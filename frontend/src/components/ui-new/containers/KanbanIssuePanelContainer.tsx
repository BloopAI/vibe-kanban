import { useState, useMemo, useCallback, useEffect } from 'react';
import { useEntity } from '@/lib/electric/hooks';
import {
  PROJECT_STATUS_ENTITY,
  TAG_ENTITY,
  ISSUE_ENTITY,
  type IssuePriority,
} from 'shared/remote-types';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import {
  KanbanIssuePanel,
  type IssueFormData,
} from '@/components/ui-new/views/KanbanIssuePanel';
import type { User } from '@/components/ui-new/kanban/IssuePropertyRow';

interface KanbanIssuePanelContainerProps {
  projectId: string;
}

// Generate a display ID based on issue count
function generateDisplayId(prefix: string, count: number): string {
  return `${prefix}-${(count + 1).toString().padStart(3, '0')}`;
}

export function KanbanIssuePanelContainer({
  projectId,
}: KanbanIssuePanelContainerProps) {
  const selectedKanbanIssueId = useUiPreferencesStore(
    (s) => s.selectedKanbanIssueId
  );
  const kanbanCreateMode = useUiPreferencesStore((s) => s.kanbanCreateMode);
  const closeKanbanIssuePanel = useUiPreferencesStore(
    (s) => s.closeKanbanIssuePanel
  );

  // Fetch project statuses
  const { data: statuses, isLoading: statusesLoading } = useEntity(
    PROJECT_STATUS_ENTITY,
    { project_id: projectId }
  );

  // Fetch tags
  const { data: tags, isLoading: tagsLoading } = useEntity(TAG_ENTITY, {
    project_id: projectId,
  });

  // Fetch issues for the project (to generate display ID and find selected issue)
  const {
    data: issues,
    isLoading: issuesLoading,
    insert: insertIssue,
  } = useEntity(ISSUE_ENTITY, { project_id: projectId });

  // Find selected issue if in edit mode
  const selectedIssue = useMemo(() => {
    if (kanbanCreateMode || !selectedKanbanIssueId) return null;
    return issues.find((i) => i.id === selectedKanbanIssueId) ?? null;
  }, [issues, selectedKanbanIssueId, kanbanCreateMode]);

  // Determine mode (only edit when an issue is selected)
  const mode = kanbanCreateMode || !selectedKanbanIssueId ? 'create' : 'edit';

  // Sort statuses by sort_order
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  // Default status (first one by sort order)
  const defaultStatusId = sortedStatuses[0]?.id ?? '';

  // Generate display ID for create mode
  const displayId = useMemo(() => {
    if (mode === 'edit' && selectedIssue) {
      // In a real app, this would come from the issue data
      // For now, generate based on position in list
      const issueIndex = issues.findIndex((i) => i.id === selectedIssue.id);
      return generateDisplayId('Task', issueIndex);
    }
    return generateDisplayId('Task', issues.length);
  }, [mode, selectedIssue, issues]);

  // Form state
  const [formData, setFormData] = useState<IssueFormData>(() => ({
    title: '',
    description: null,
    statusId: defaultStatusId,
    priority: 'medium' as IssuePriority,
    assigneeId: null,
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
        assigneeId: null,
        tagIds: [],
        createDraftWorkspace: false,
      });
    } else if (selectedIssue) {
      setFormData({
        title: selectedIssue.title,
        description: selectedIssue.description,
        statusId: selectedIssue.status_id,
        priority: selectedIssue.priority,
        assigneeId: null, // Would come from issue_assignees table
        tagIds: [], // Would come from issue_tags table
        createDraftWorkspace: false,
      });
    }
  }, [mode, selectedIssue, defaultStatusId]);

  // Form change handler
  const handleFormChange = useCallback(
    <K extends keyof IssueFormData>(field: K, value: IssueFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
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

        await insertIssue({
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
  }, [mode, formData, projectId, issues, insertIssue, closeKanbanIssuePanel]);

  // TODO: Fetch real users from organization members
  const users: User[] = useMemo(
    () => [
      {
        id: 'user-1',
        firstName: 'Schnitzel',
        lastName: 'Boy',
        username: 'schnitzelboy',
        imageUrl: null,
      },
    ],
    []
  );

  // Loading state
  const isLoading = statusesLoading || tagsLoading || issuesLoading;

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
      onFormChange={handleFormChange}
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
