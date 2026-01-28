import { useMemo, useCallback } from 'react';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { useOrgContext } from '@/contexts/remote/OrgContext';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import {
  IssueSubIssuesSection,
  type SubIssueData,
} from '@/components/ui-new/views/IssueSubIssuesSection';

interface IssueSubIssuesSectionContainerProps {
  issueId: string;
}

/**
 * Container component for the sub-issues section.
 * Fetches sub-issues from ProjectContext and transforms them for display.
 */
export function IssueSubIssuesSectionContainer({
  issueId,
}: IssueSubIssuesSectionContainerProps) {
  const {
    issues,
    statuses,
    getAssigneesForIssue,
    isLoading: projectLoading,
  } = useProjectContext();

  const { membersWithProfilesById, isLoading: orgLoading } = useOrgContext();

  const openKanbanIssuePanel = useUiPreferencesStore(
    (s) => s.openKanbanIssuePanel
  );

  // Create lookup maps for efficient access
  const statusesById = useMemo(() => {
    return new Map(statuses.map((s) => [s.id, s]));
  }, [statuses]);

  // Filter and transform sub-issues
  const subIssues: SubIssueData[] = useMemo(() => {
    return issues
      .filter((issue) => issue.parent_issue_id === issueId)
      .map((issue) => {
        const status = statusesById.get(issue.status_id);
        const assigneeRecords = getAssigneesForIssue(issue.id);
        const assignees = assigneeRecords
          .map((a) => membersWithProfilesById.get(a.user_id))
          .filter((u): u is NonNullable<typeof u> => u !== undefined);

        return {
          id: issue.id,
          simpleId: issue.simple_id,
          title: issue.title,
          priority: issue.priority,
          statusColor: status?.color ?? '#888888',
          assignees,
          createdAt: issue.created_at,
        };
      });
  }, [
    issues,
    issueId,
    statusesById,
    membersWithProfilesById,
    getAssigneesForIssue,
  ]);

  // Handle clicking on a sub-issue to navigate to it
  const handleSubIssueClick = useCallback(
    (subIssueId: string) => {
      openKanbanIssuePanel(subIssueId);
    },
    [openKanbanIssuePanel]
  );

  const isLoading = projectLoading || orgLoading;

  return (
    <IssueSubIssuesSection
      subIssues={subIssues}
      onSubIssueClick={handleSubIssueClick}
      isLoading={isLoading}
    />
  );
}
