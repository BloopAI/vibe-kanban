import { useMemo } from 'react';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import type {
  Issue,
  IssueAssignee,
  IssueTag,
  IssuePriority,
} from 'shared/remote-types';

type UseKanbanFiltersParams = {
  issues: Issue[];
  issueAssignees: IssueAssignee[];
  issueTags: IssueTag[];
  projectId: string;
};

type UseKanbanFiltersResult = {
  filteredIssues: Issue[];
  hasActiveFilters: boolean;
};

export const PRIORITY_ORDER: Record<IssuePriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function useKanbanFilters({
  issues,
  issueAssignees,
  issueTags,
  projectId,
}: UseKanbanFiltersParams): UseKanbanFiltersResult {
  const kanbanFilters = useUiPreferencesStore((s) => s.kanbanFilters);
  const showSubIssuesByProject = useUiPreferencesStore(
    (s) => s.showSubIssuesByProject
  );
  const showSubIssues = showSubIssuesByProject[projectId] ?? true;

  // Create lookup maps for efficient filtering
  const assigneesByIssue = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const ia of issueAssignees) {
      if (!map[ia.issue_id]) {
        map[ia.issue_id] = [];
      }
      map[ia.issue_id].push(ia.user_id);
    }
    return map;
  }, [issueAssignees]);

  const tagsByIssue = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const it of issueTags) {
      if (!map[it.issue_id]) {
        map[it.issue_id] = [];
      }
      map[it.issue_id].push(it.tag_id);
    }
    return map;
  }, [issueTags]);

  // Calculate whether any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      kanbanFilters.searchQuery.trim() !== '' ||
      kanbanFilters.priorities.length > 0 ||
      kanbanFilters.assigneeIds.length > 0 ||
      kanbanFilters.tagIds.length > 0
    );
  }, [kanbanFilters]);

  // Filter issues
  const filteredIssues = useMemo(() => {
    let result = issues;

    // Filter sub-issues based on per-project preference
    if (!showSubIssues) {
      result = result.filter((issue) => issue.parent_issue_id === null);
    }

    // Text search (title)
    const query = kanbanFilters.searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((issue) =>
        issue.title.toLowerCase().includes(query)
      );
    }

    // Priority filter (OR within)
    if (kanbanFilters.priorities.length > 0) {
      result = result.filter(
        (issue) =>
          issue.priority !== null &&
          kanbanFilters.priorities.includes(issue.priority)
      );
    }

    // Assignee filter (OR within)
    if (kanbanFilters.assigneeIds.length > 0) {
      result = result.filter((issue) => {
        const issueAssigneeIds = assigneesByIssue[issue.id] ?? [];

        // Check for 'unassigned' special case
        if (kanbanFilters.assigneeIds.includes('unassigned')) {
          if (issueAssigneeIds.length === 0) return true;
        }

        // Check if any of the issue's assignees match the filter
        return issueAssigneeIds.some((assigneeId) =>
          kanbanFilters.assigneeIds.includes(assigneeId)
        );
      });
    }

    // Tags filter (OR within)
    if (kanbanFilters.tagIds.length > 0) {
      result = result.filter((issue) => {
        const issueTagIds = tagsByIssue[issue.id] ?? [];
        return issueTagIds.some((tagId) =>
          kanbanFilters.tagIds.includes(tagId)
        );
      });
    }

    // Note: Sorting is handled in KanbanContainer after grouping by status
    // so that sort order is applied within each column

    return result;
  }, [issues, kanbanFilters, assigneesByIssue, tagsByIssue, showSubIssues]);

  return {
    filteredIssues,
    hasActiveFilters,
  };
}
