import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import type { Project } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { defineModal } from '@/lib/modals';
import { CommandDialog } from '@/components/ui-new/primitives/Command';
import {
  MultiSelectCommandBar,
  type MultiSelectOption,
} from '@/components/ui-new/primitives/MultiSelectCommandBar';
import { UserAvatar } from '@/components/ui-new/primitives/UserAvatar';
import { OrgProvider, useOrgContext } from '@/contexts/remote/OrgContext';
import {
  ProjectProvider,
  useProjectContext,
} from '@/contexts/remote/ProjectContext';
import { useOrganizationStore } from '@/stores/useOrganizationStore';
import { useOrganizationProjects } from '@/hooks/useOrganizationProjects';

export interface AssigneeSelectionDialogProps {
  projectId: string;
  issueIds: string[];
  isCreateMode?: boolean;
}

const getUserDisplayName = (user: OrganizationMemberWithProfile): string => {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.username ||
    'User'
  );
};

/** Inner component that uses contexts to render the selection UI */
function AssigneeSelectionContent({
  issueIds,
  isCreateMode,
}: {
  issueIds: string[];
  isCreateMode: boolean;
}) {
  const { t } = useTranslation('common');
  const modal = useModal();
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Get users from OrgContext - use membersWithProfilesById for OrganizationMemberWithProfile
  const { membersWithProfilesById } = useOrgContext();
  const users = useMemo(
    () => [...membersWithProfilesById.values()],
    [membersWithProfilesById]
  );

  // Get issue assignees and mutation functions from ProjectContext
  const { issueAssignees, insertIssueAssignee, removeIssueAssignee } =
    useProjectContext();

  // Get/set create mode defaults from URL (URL is single source of truth)
  const [searchParams, setSearchParams] = useSearchParams();
  const kanbanCreateDefaultAssigneeIds = useMemo(() => {
    const assigneesParam = searchParams.get('assignees');
    return assigneesParam ? assigneesParam.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const setKanbanCreateDefaultAssigneeIds = useCallback(
    (assigneeIds: string[]) => {
      const newParams = new URLSearchParams(searchParams);
      if (assigneeIds.length > 0) {
        newParams.set('assignees', assigneeIds.join(','));
      } else {
        newParams.delete('assignees');
      }
      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Compute initial assignee IDs based on mode
  const initialAssigneeIds = useMemo(() => {
    if (isCreateMode) {
      return kanbanCreateDefaultAssigneeIds;
    }
    // Edit mode: get current assignees for the issue(s)
    return issueAssignees
      .filter((a) => issueIds.includes(a.issue_id))
      .map((a) => a.user_id);
  }, [isCreateMode, issueIds, issueAssignees, kanbanCreateDefaultAssigneeIds]);

  const [selectedIds, setSelectedIds] = useState<string[]>(initialAssigneeIds);
  const [search, setSearch] = useState('');

  // Capture focus when dialog opens and reset state
  useEffect(() => {
    if (modal.visible) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setSelectedIds(initialAssigneeIds);
      setSearch('');
    }
  }, [modal.visible, initialAssigneeIds]);

  const options: MultiSelectOption<string>[] = useMemo(
    () =>
      users.map((user) => ({
        value: user.user_id,
        label: getUserDisplayName(user),
        searchValue: `${user.user_id} ${getUserDisplayName(user)} ${user.email ?? ''}`,
        renderOption: () => (
          <div className="flex items-center gap-base">
            <UserAvatar user={user} className="h-5 w-5 text-[10px]" />
            <span>{getUserDisplayName(user)}</span>
          </div>
        ),
      })),
    [users]
  );

  const handleToggle = useCallback((userId: string) => {
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (isCreateMode) {
      // Create mode: update the default assignees in store
      setKanbanCreateDefaultAssigneeIds(selectedIds);
    } else {
      // Edit mode: apply changes via junction table mutations
      const currentAssigneeRecords = issueAssignees.filter((a) =>
        issueIds.includes(a.issue_id)
      );

      // For each issue, compute and apply changes
      for (const issueId of issueIds) {
        const issueAssigneeRecords = currentAssigneeRecords.filter(
          (a) => a.issue_id === issueId
        );
        const issueCurrentIds = new Set(
          issueAssigneeRecords.map((a) => a.user_id)
        );

        // Remove assignees no longer selected
        for (const record of issueAssigneeRecords) {
          if (!selectedIds.includes(record.user_id)) {
            removeIssueAssignee(record.id);
          }
        }

        // Add new assignees
        for (const userId of selectedIds) {
          if (!issueCurrentIds.has(userId)) {
            insertIssueAssignee({
              issue_id: issueId,
              user_id: userId,
            });
          }
        }
      }
    }
    modal.hide();
  }, [
    isCreateMode,
    selectedIds,
    issueIds,
    issueAssignees,
    setKanbanCreateDefaultAssigneeIds,
    insertIssueAssignee,
    removeIssueAssignee,
    modal,
  ]);

  // Restore focus when dialog closes
  const handleCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    previousFocusRef.current?.focus();
  }, []);

  return (
    <CommandDialog
      open={modal.visible}
      onOpenChange={(open) => !open && modal.hide()}
      onCloseAutoFocus={handleCloseAutoFocus}
    >
      <MultiSelectCommandBar
        title={t('kanban.selectAssignees', 'Select assignees...')}
        options={options}
        selectedValues={selectedIds}
        onToggle={handleToggle}
        onConfirm={handleConfirm}
        search={search}
        onSearchChange={setSearch}
      />
    </CommandDialog>
  );
}

/** Wrapper that provides OrgContext and ProjectContext */
function AssigneeSelectionWithContext({
  projectId,
  issueIds,
  isCreateMode = false,
}: AssigneeSelectionDialogProps) {
  // Get organization ID from store (set when navigating to project)
  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);

  // Fallback: try to find org from projects if not in store
  const { data: projects = [] } = useOrganizationProjects(selectedOrgId);
  const project = projects.find((p: Project) => p.id === projectId);
  const organizationId = project?.organization_id ?? selectedOrgId;

  // If we don't have the required IDs, render nothing
  if (!organizationId || !projectId) {
    return null;
  }

  return (
    <OrgProvider organizationId={organizationId}>
      <ProjectProvider projectId={projectId}>
        <AssigneeSelectionContent
          issueIds={issueIds}
          isCreateMode={isCreateMode}
        />
      </ProjectProvider>
    </OrgProvider>
  );
}

const AssigneeSelectionDialogImpl =
  NiceModal.create<AssigneeSelectionDialogProps>(
    ({ projectId, issueIds, isCreateMode }) => {
      return (
        <AssigneeSelectionWithContext
          projectId={projectId}
          issueIds={issueIds}
          isCreateMode={isCreateMode}
        />
      );
    }
  );

export const AssigneeSelectionDialog = defineModal<
  AssigneeSelectionDialogProps,
  void
>(AssigneeSelectionDialogImpl);
