import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { useNavigate } from 'react-router-dom';
import type { IssuePriority } from 'shared/remote-types';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { useOrgContext } from '@/contexts/remote/OrgContext';
import { useKanbanNavigation } from '@/hooks/useKanbanNavigation';
import {
  KanbanIssuePanel,
  type IssueFormData,
} from '@/components/ui-new/views/KanbanIssuePanel';
import { useActions } from '@/contexts/ActionsContext';
import { useUserContext } from '@/contexts/remote/UserContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';
import { getWorkspaceDefaults } from '@/lib/workspaceDefaults';
import { ScratchType, type DraftIssueData } from 'shared/types';
import { useScratch } from '@/hooks/useScratch';

const DRAFT_ISSUE_ID = '00000000-0000-0000-0000-000000000002';

/**
 * KanbanIssuePanelContainer manages the issue detail/create panel.
 * Uses ProjectContext and OrgContext for data and mutations.
 * Must be rendered within both OrgProvider and ProjectProvider.
 */
export function KanbanIssuePanelContainer() {
  // Navigation hook - URL is single source of truth
  const {
    issueId: selectedKanbanIssueId,
    isCreateMode: kanbanCreateMode,
    createDefaultStatusId: kanbanCreateDefaultStatusId,
    createDefaultPriority: kanbanCreateDefaultPriority,
    createDefaultAssigneeIds: kanbanCreateDefaultAssigneeIds,
    createDefaultParentIssueId: kanbanCreateDefaultParentIssueId,
    openIssue,
    closePanel,
    updateCreateDefaults,
  } = useKanbanNavigation();

  const navigate = useNavigate();
  const { workspaces } = useUserContext();
  const { activeWorkspaces, archivedWorkspaces } = useWorkspaceContext();

  // Build set of local workspace IDs that exist on this machine
  const localWorkspaceIds = useMemo(
    () =>
      new Set([
        ...activeWorkspaces.map((w) => w.id),
        ...archivedWorkspaces.map((w) => w.id),
      ]),
    [activeWorkspaces, archivedWorkspaces]
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
    insertIssueTag,
    removeIssueTag,
    insertTag,
    getTagsForIssue,
    getPullRequestsForIssue,
    isLoading: projectLoading,
  } = useProjectContext();

  const { isLoading: orgLoading, membersWithProfilesById } = useOrgContext();

  // Get action methods from actions context
  const { openStatusSelection, openPrioritySelection, openAssigneeSelection } =
    useActions();

  // Close panel by navigating to project URL (URL is single source of truth)
  const closeKanbanIssuePanel = closePanel;

  // Close panel if selected issue doesn't exist in current project
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

  const creatorUserId = selectedIssue?.creator_user_id ?? null;
  const issueCreator = useMemo(() => {
    if (!creatorUserId) return null;
    return membersWithProfilesById.get(creatorUserId) ?? null;
  }, [membersWithProfilesById, creatorUserId]);

  // Find parent issue if current issue has one
  const parentIssue = useMemo(() => {
    if (!selectedIssue?.parent_issue_id) return null;
    const parent = issues.find((i) => i.id === selectedIssue.parent_issue_id);
    if (!parent) return null;
    return { id: parent.id, simpleId: parent.simple_id };
  }, [issues, selectedIssue]);

  // Handler for clicking on parent issue - navigate to that issue
  const handleParentIssueClick = useCallback(() => {
    if (parentIssue) {
      openIssue(parentIssue.id);
    }
  }, [parentIssue, openIssue]);

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

  // Get linked PRs for the issue
  const linkedPrs = useMemo(() => {
    if (!selectedKanbanIssueId) return [];
    return getPullRequestsForIssue(selectedKanbanIssueId).map((pr) => ({
      id: pr.id,
      number: pr.number,
      url: pr.url,
      status: pr.status,
    }));
  }, [getPullRequestsForIssue, selectedKanbanIssueId]);

  // Determine mode (only edit when an issue is selected)
  const mode = kanbanCreateMode || !selectedKanbanIssueId ? 'create' : 'edit';

  // Sort statuses by sort_order
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  // Default status: use kanbanCreateDefaultStatusId if set, otherwise first by sort order
  const defaultStatusId =
    kanbanCreateDefaultStatusId ?? sortedStatuses[0]?.id ?? '';

  // Track previous issue ID to detect actual issue switches (not just data updates)
  const prevIssueIdRef = useRef<string | null>(null);

  // Track previous issue ID for title content sync
  const lastTitleIssueIdRef = useRef<string | null | undefined>(null);

  // For create mode - full local state needed
  const [createFormData, setCreateFormData] = useState<IssueFormData | null>(
    null
  );

  // Callback ref that handles title content sync and auto-focus
  const titleRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        // Set title content when issue changes
        if (selectedKanbanIssueId !== lastTitleIssueIdRef.current) {
          const title =
            mode === 'create'
              ? (createFormData?.title ?? '')
              : (selectedIssue?.title ?? '');
          node.textContent = title;
          lastTitleIssueIdRef.current = selectedKanbanIssueId;
        } else if (
          mode === 'create' &&
          createFormData?.title &&
          node.textContent !== createFormData.title
        ) {
          // Handle late scratch restore: title data changed but issue ID didn't
          node.textContent = createFormData.title;
        }
        // Auto-focus in create mode after any dialog close focus handling runs.
        if (mode === 'create') {
          requestAnimationFrame(() => {
            node.focus();
            // Place cursor at end of content (not start)
            if (node.textContent) {
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(node);
              range.collapse(false);
              selection?.removeAllRanges();
              selection?.addRange(range);
            }
          });
        }
      }
    },
    [selectedKanbanIssueId, selectedIssue?.title, mode, createFormData?.title]
  );

  // Display ID: use real simple_id in edit mode, placeholder for create mode
  const displayId = useMemo(() => {
    if (mode === 'edit' && selectedIssue) {
      return selectedIssue.simple_id;
    }
    return 'New Issue';
  }, [mode, selectedIssue]);

  // For edit mode - only track text field edits (title, description)
  // Dropdown fields (status, priority, assignees, tags) derive from server state
  // When null, no local edits exist; values are read from server state
  const [localTextEdits, setLocalTextEdits] = useState<{
    title: string | null;
    description: string | null;
  } | null>(null);

  // Compute display values based on mode
  // - Create mode: createFormData is the single source of truth
  // - Edit mode: text fields from localTextEdits (if editing) or server, dropdown fields always from server
  const displayData = useMemo((): IssueFormData => {
    if (mode === 'create') {
      return (
        createFormData ?? {
          title: '',
          description: null,
          statusId: defaultStatusId,
          priority: null,
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
      priority: selectedIssue?.priority ?? null, // Always from server
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

  // Resolve assignee IDs to full profiles for avatar display
  const displayAssigneeUsers = useMemo(() => {
    return displayData.assigneeIds
      .map((id) => membersWithProfilesById.get(id))
      .filter((m): m is OrganizationMemberWithProfile => m != null);
  }, [displayData.assigneeIds, membersWithProfilesById]);

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

  // Draft issue scratch persistence
  const {
    scratch: draftIssueScratch,
    updateScratch: updateDraftIssueScratch,
    deleteScratch: deleteDraftIssueScratch,
    isLoading: draftIssueLoading,
  } = useScratch(ScratchType.DRAFT_ISSUE, DRAFT_ISSUE_ID);

  const {
    debounced: debouncedSaveDraftIssue,
    cancel: cancelDebouncedDraftIssue,
  } = useDebouncedCallback(async (data: DraftIssueData) => {
    try {
      await updateDraftIssueScratch({
        payload: { type: 'DRAFT_ISSUE', data },
      });
    } catch (e) {
      console.error('Failed to save draft issue:', e);
    }
  }, 500);

  // Track whether we've already restored from scratch in this create-mode session
  const hasRestoredFromScratch = useRef(false);

  // Reset save status only when switching to a different issue or mode
  useEffect(() => {
    setDescriptionSaveStatus('idle');
  }, [selectedKanbanIssueId, kanbanCreateMode]);

  // Helper to build form data from a draft issue scratch
  const restoreFromScratch = useCallback(
    (scratchData: DraftIssueData): IssueFormData => {
      const statusExists = statuses.some((s) => s.id === scratchData.status_id);
      return {
        title: scratchData.title,
        description: scratchData.description ?? null,
        statusId: statusExists ? scratchData.status_id : defaultStatusId,
        priority: (scratchData.priority as IssueFormData['priority']) ?? null,
        assigneeIds: scratchData.assignee_ids,
        tagIds: scratchData.tag_ids,
        createDraftWorkspace: scratchData.create_draft_workspace,
      };
    },
    [statuses, defaultStatusId]
  );

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
    cancelDebouncedDraftIssue();

    // Clear local text edits (they apply to the previous issue)
    setLocalTextEdits(null);

    // Initialize create form data if in create mode
    if (mode === 'create') {
      hasRestoredFromScratch.current = false;

      // Gate on scratch loading — don't initialize until we know the scratch state
      if (draftIssueLoading) {
        setCreateFormData(null);
        return;
      }

      // Priority 1: Restore from scratch if available for this project
      const scratchData =
        draftIssueScratch?.payload?.type === 'DRAFT_ISSUE'
          ? draftIssueScratch.payload.data
          : undefined;

      if (scratchData && scratchData.project_id === projectId) {
        hasRestoredFromScratch.current = true;
        setCreateFormData(restoreFromScratch(scratchData));
      } else {
        // Priority 2: Seed from URL defaults (read once), then empty form
        setCreateFormData({
          title: '',
          description: null,
          statusId: kanbanCreateDefaultStatusId ?? defaultStatusId,
          priority: kanbanCreateDefaultPriority ?? null,
          assigneeIds: kanbanCreateDefaultAssigneeIds ?? [],
          tagIds: [],
          createDraftWorkspace: false,
        });
      }
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
    cancelDebouncedDraftIssue,
    draftIssueScratch,
    draftIssueLoading,
    projectId,
    restoreFromScratch,
    kanbanCreateDefaultStatusId,
    kanbanCreateDefaultPriority,
    kanbanCreateDefaultAssigneeIds,
  ]);

  // Handle late scratch loading: if scratch arrives after initial create mode render
  useEffect(() => {
    if (mode !== 'create') {
      hasRestoredFromScratch.current = false;
      return;
    }
    if (hasRestoredFromScratch.current) return;
    if (draftIssueLoading) return;

    const scratchData =
      draftIssueScratch?.payload?.type === 'DRAFT_ISSUE'
        ? draftIssueScratch.payload.data
        : undefined;

    if (scratchData && scratchData.project_id === projectId) {
      hasRestoredFromScratch.current = true;
      setCreateFormData(restoreFromScratch(scratchData));
    } else if (createFormData === null) {
      // Scratch loaded but no data — seed from URL defaults
      setCreateFormData({
        title: '',
        description: null,
        statusId: kanbanCreateDefaultStatusId ?? defaultStatusId,
        priority: kanbanCreateDefaultPriority ?? null,
        assigneeIds: kanbanCreateDefaultAssigneeIds ?? [],
        tagIds: [],
        createDraftWorkspace: false,
      });
    }
  }, [
    mode,
    draftIssueScratch,
    draftIssueLoading,
    projectId,
    restoreFromScratch,
    createFormData,
    kanbanCreateDefaultStatusId,
    kanbanCreateDefaultPriority,
    kanbanCreateDefaultAssigneeIds,
    defaultStatusId,
  ]);

  // Auto-save draft issue to scratch when form data changes in create mode
  useEffect(() => {
    if (mode !== 'create' || !createFormData || !projectId) return;

    debouncedSaveDraftIssue({
      title: createFormData.title,
      description: createFormData.description ?? undefined,
      status_id: createFormData.statusId,
      priority: createFormData.priority ?? undefined,
      assignee_ids: createFormData.assigneeIds,
      tag_ids: createFormData.tagIds,
      create_draft_workspace: createFormData.createDraftWorkspace,
      project_id: projectId,
      parent_issue_id: kanbanCreateDefaultParentIssueId ?? undefined,
    } as DraftIssueData);
  }, [
    mode,
    createFormData,
    projectId,
    kanbanCreateDefaultParentIssueId,
    debouncedSaveDraftIssue,
  ]);

  // Form change handler - persists changes immediately in edit mode
  const handlePropertyChange = useCallback(
    async <K extends keyof IssueFormData>(
      field: K,
      value: IssueFormData[K]
    ) => {
      // Create mode: update createFormData for all fields
      if (kanbanCreateMode || !selectedKanbanIssueId) {
        // For statusId, open the status selection dialog with callback
        if (field === 'statusId') {
          const { ProjectSelectionDialog } = await import(
            '@/components/ui-new/dialogs/selections/ProjectSelectionDialog'
          );
          const result = await ProjectSelectionDialog.show({
            projectId,
            selection: { type: 'status', issueIds: [], isCreateMode: true },
          });
          if (result && typeof result === 'object' && 'statusId' in result) {
            updateCreateDefaults({ statusId: result.statusId as string });
          }
          return;
        }

        // For priority, open the priority selection dialog with callback
        if (field === 'priority') {
          const { ProjectSelectionDialog } = await import(
            '@/components/ui-new/dialogs/selections/ProjectSelectionDialog'
          );
          const result = await ProjectSelectionDialog.show({
            projectId,
            selection: { type: 'priority', issueIds: [], isCreateMode: true },
          });
          if (result && typeof result === 'object' && 'priority' in result) {
            updateCreateDefaults({
              priority: (result as { priority: IssuePriority | null }).priority,
            });
          }
          return;
        }

        // For assigneeIds, open the assignee selection dialog with callback
        if (field === 'assigneeIds') {
          const { AssigneeSelectionDialog } = await import(
            '@/components/ui-new/dialogs/AssigneeSelectionDialog'
          );
          await AssigneeSelectionDialog.show({
            projectId,
            issueIds: [],
            isCreateMode: true,
            createModeAssigneeIds: createFormData?.assigneeIds ?? [],
            onCreateModeAssigneesChange: (assigneeIds: string[]) => {
              setCreateFormData((prev) =>
                prev ? { ...prev, assigneeIds } : prev
              );
            },
          });
          return;
        }

        // For other fields, just update the form data
        setCreateFormData((prev) => {
          const base = prev ?? {
            title: '',
            description: null,
            statusId: defaultStatusId,
            priority: null,
            assigneeIds: [],
            tagIds: [],
            createDraftWorkspace: false,
          };
          return { ...base, [field]: value };
        });
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
        // Priority changes go through the command bar priority selection
        openPrioritySelection(projectId, [selectedKanbanIssueId]);
      } else if (field === 'assigneeIds') {
        // Assignee changes go through the assignee selection dialog
        openAssigneeSelection(projectId, [selectedKanbanIssueId], false);
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
      defaultStatusId,
      createFormData,
      debouncedSaveTitle,
      debouncedSaveDescription,
      openStatusSelection,
      openPrioritySelection,
      openAssigneeSelection,
      updateCreateDefaults,
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
        // Create new issue at the top of the column
        const statusIssues = issues.filter(
          (i) => i.status_id === displayData.statusId
        );
        const minSortOrder =
          statusIssues.length > 0
            ? Math.min(...statusIssues.map((i) => i.sort_order))
            : 0;

        const { persisted } = insertIssue({
          project_id: projectId,
          status_id: displayData.statusId,
          title: displayData.title,
          description: displayData.description,
          priority: displayData.priority,
          sort_order: minSortOrder - 1,
          start_date: null,
          target_date: null,
          completed_at: null,
          parent_issue_id: kanbanCreateDefaultParentIssueId,
          parent_issue_sort_order: null,
          extension_metadata: null,
        });

        // Wait for the issue to be confirmed by the backend and get the synced entity
        const syncedIssue = await persisted;

        // Create assignee records for all selected assignees
        displayData.assigneeIds.forEach((userId) => {
          insertIssueAssignee({
            issue_id: syncedIssue.id,
            user_id: userId,
          });
        });

        // Create tag records if tags were selected
        for (const tagId of displayData.tagIds) {
          insertIssueTag({
            issue_id: syncedIssue.id,
            tag_id: tagId,
          });
        }

        // Navigate to workspace creation if requested
        if (displayData.createDraftWorkspace) {
          // Build initial prompt from issue title and description
          const initialPrompt = displayData.description
            ? `${displayData.title}\n\n${displayData.description}`
            : displayData.title;

          // Get defaults from most recent workspace
          const defaults = await getWorkspaceDefaults(
            workspaces,
            localWorkspaceIds
          );

          // Clean up draft scratch after successful creation
          cancelDebouncedDraftIssue();
          deleteDraftIssueScratch().catch(console.error);

          navigate('/workspaces/create', {
            state: {
              initialPrompt,
              preferredRepos: defaults?.preferredRepos ?? null,
              project_id: defaults?.project_id ?? null,
              linkedIssue: {
                issueId: syncedIssue.id,
                simpleId: syncedIssue.simple_id,
                title: displayData.title,
                remoteProjectId: projectId,
              },
            },
          });
          return; // Don't open issue panel since we're navigating away
        }

        // Clean up draft scratch after successful creation
        cancelDebouncedDraftIssue();
        deleteDraftIssueScratch().catch(console.error);

        // Open the newly created issue
        openIssue(syncedIssue.id);
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
    openIssue,
    kanbanCreateDefaultParentIssueId,
    navigate,
    workspaces,
    localWorkspaceIds,
    closeKanbanIssuePanel,
    cancelDebouncedDraftIssue,
    deleteDraftIssueScratch,
  ]);

  // Tag create callback - returns the new tag ID so it can be auto-selected
  const handleCreateTag = useCallback(
    (data: { name: string; color: string }): string => {
      const { data: newTag } = insertTag({
        project_id: projectId,
        name: data.name,
        color: data.color,
      });
      return newTag.id;
    },
    [insertTag, projectId]
  );

  // Copy link callback - copies issue URL to clipboard
  const handleCopyLink = useCallback(() => {
    if (!selectedKanbanIssueId || !projectId) return;
    const url = `${window.location.origin}/projects/${projectId}/issues/${selectedKanbanIssueId}`;
    navigator.clipboard.writeText(url);
  }, [projectId, selectedKanbanIssueId]);

  // More actions callback - opens command bar with issue actions
  const handleMoreActions = useCallback(async () => {
    if (!selectedKanbanIssueId || !projectId) return;
    await CommandBarDialog.show({
      page: 'issueActions',
      projectId,
      issueIds: [selectedKanbanIssueId],
    });
  }, [selectedKanbanIssueId, projectId]);

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
      assigneeUsers={displayAssigneeUsers}
      onFormChange={handlePropertyChange}
      statuses={sortedStatuses}
      tags={tags}
      issueId={selectedKanbanIssueId}
      creatorUser={issueCreator}
      parentIssue={parentIssue}
      onParentIssueClick={handleParentIssueClick}
      linkedPrs={linkedPrs}
      onClose={closeKanbanIssuePanel}
      onSubmit={handleSubmit}
      onCmdEnterSubmit={handleSubmit}
      onCreateTag={handleCreateTag}
      isSubmitting={isSubmitting}
      isLoading={isLoading}
      descriptionSaveStatus={
        mode === 'edit' ? descriptionSaveStatus : undefined
      }
      titleRef={titleRefCallback}
      onCopyLink={mode === 'edit' ? handleCopyLink : undefined}
      onMoreActions={mode === 'edit' ? handleMoreActions : undefined}
    />
  );
}
