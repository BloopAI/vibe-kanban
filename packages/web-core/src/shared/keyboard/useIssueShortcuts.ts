import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams } from '@tanstack/react-router';
import { useHotkeys } from 'react-hotkeys-hook';
import { useActions } from '@/shared/hooks/useActions';
import { Actions } from '@/shared/actions';
import {
  type ActionDefinition,
  ActionTargetType,
} from '@/shared/types/actions';
import { Scope } from '@/shared/keyboard/registry';
import { isProjectDestination } from '@/shared/lib/routes/appNavigation';
import { useCurrentAppDestination } from '@/shared/hooks/useCurrentAppDestination';
import { useCurrentKanbanRouteState } from '@/shared/hooks/useCurrentKanbanRouteState';
import { useIssueSelectionStore } from '@/shared/stores/useIssueSelectionStore';

const SEQUENCE_TIMEOUT_MS = 1500;

const OPTIONS = {
  scopes: [Scope.KANBAN],
  sequenceTimeout: SEQUENCE_TIMEOUT_MS,
} as const;

export function useIssueShortcuts() {
  const { executeAction } = useActions();
  const { projectId, issueId } = useParams({ strict: false });
  const destination = useCurrentAppDestination();
  const { isCreateMode: isCreatingIssue } = useCurrentKanbanRouteState();

  const isKanban = isProjectDestination(destination);

  // Multi-selection support
  const multiSelectedIssueIds = useIssueSelectionStore(
    (s) => s.selectedIssueIds
  );
  const selectAll = useIssueSelectionStore((s) => s.selectAll);
  const clearSelection = useIssueSelectionStore((s) => s.clearSelection);
  const toggleIssue = useIssueSelectionStore((s) => s.toggleIssue);
  const selectAdjacent = useIssueSelectionStore((s) => s.selectAdjacent);

  const executeActionRef = useRef(executeAction);
  const projectIdRef = useRef(projectId);
  const issueIdRef = useRef(issueId);
  const isKanbanRef = useRef(isKanban);
  const isCreatingIssueRef = useRef(isCreatingIssue);
  const multiSelectedIssueIdsRef = useRef(multiSelectedIssueIds);
  const selectAllRef = useRef(selectAll);
  const clearSelectionRef = useRef(clearSelection);
  const toggleIssueRef = useRef(toggleIssue);
  const selectAdjacentRef = useRef(selectAdjacent);

  useEffect(() => {
    executeActionRef.current = executeAction;
    projectIdRef.current = projectId;
    issueIdRef.current = issueId;
    isKanbanRef.current = isKanban;
    isCreatingIssueRef.current = isCreatingIssue;
    multiSelectedIssueIdsRef.current = multiSelectedIssueIds;
    selectAllRef.current = selectAll;
    clearSelectionRef.current = clearSelection;
    toggleIssueRef.current = toggleIssue;
    selectAdjacentRef.current = selectAdjacent;
  });

  // Clean up sequence timer on unmount
  useEffect(() => {
    return () => clearTimeout(sequenceTimerRef.current);
  }, []);

  // Use multi-selected IDs when available, otherwise fall back to single issue
  const issueIds = useMemo(() => {
    if (multiSelectedIssueIds.size > 0) {
      return [...multiSelectedIssueIds];
    }
    return issueId ? [issueId] : [];
  }, [multiSelectedIssueIds, issueId]);
  const issueIdsRef = useRef(issueIds);
  useEffect(() => {
    issueIdsRef.current = issueIds;
  });

  const executeIssueAction = useCallback(
    (action: ActionDefinition, e?: KeyboardEvent) => {
      if (!isKanbanRef.current) return;
      // react-hotkeys-hook does not call preventDefault for sequence hotkeys,
      // so we must do it manually to stop the second keystroke from being typed
      // into any focused input (e.g. the title field after i>c opens create mode).
      e?.preventDefault();

      const currentProjectId = projectIdRef.current;
      const currentIssueIds = issueIdsRef.current;

      if (action.requiresTarget === ActionTargetType.ISSUE) {
        if (!currentProjectId || currentIssueIds.length === 0) return;
        executeActionRef.current(
          action,
          undefined,
          currentProjectId,
          currentIssueIds
        );
      } else if (action.requiresTarget === ActionTargetType.NONE) {
        executeActionRef.current(action);
      }
    },
    []
  );

  const enabled = isKanban;

  // Track when a sequence prefix key (i) is pressed so standalone keys
  // like `x` don't fire during a sequence like `i>x`.
  const sequencePendingRef = useRef(false);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useHotkeys(
    'i',
    () => {
      sequencePendingRef.current = true;
      clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = setTimeout(() => {
        sequencePendingRef.current = false;
      }, SEQUENCE_TIMEOUT_MS);
    },
    { scopes: [Scope.KANBAN], enabled, keydown: true, keyup: false }
  );

  useHotkeys('i>c', (e) => executeIssueAction(Actions.CreateIssue, e), {
    ...OPTIONS,
    enabled,
  });
  useHotkeys(
    'i>s',
    (e) => {
      if (isCreatingIssueRef.current) {
        executeIssueAction(Actions.ChangeNewIssueStatus, e);
      } else {
        executeIssueAction(Actions.ChangeIssueStatus, e);
      }
    },
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>p',
    (e) => {
      if (isCreatingIssueRef.current) {
        executeIssueAction(Actions.ChangeNewIssuePriority, e);
      } else {
        executeIssueAction(Actions.ChangePriority, e);
      }
    },
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>a',
    (e) => {
      if (isCreatingIssueRef.current) {
        executeIssueAction(Actions.ChangeNewIssueAssignees, e);
      } else {
        executeIssueAction(Actions.ChangeAssignees, e);
      }
    },
    { ...OPTIONS, enabled }
  );
  useHotkeys('i>m', (e) => executeIssueAction(Actions.MakeSubIssueOf, e), {
    ...OPTIONS,
    enabled,
  });
  useHotkeys('i>b', (e) => executeIssueAction(Actions.AddSubIssue, e), {
    ...OPTIONS,
    enabled,
  });
  useHotkeys('i>u', (e) => executeIssueAction(Actions.RemoveParentIssue, e), {
    ...OPTIONS,
    enabled,
  });
  useHotkeys('i>w', (e) => executeIssueAction(Actions.LinkWorkspace, e), {
    ...OPTIONS,
    enabled,
  });
  useHotkeys('i>d', (e) => executeIssueAction(Actions.DuplicateIssue, e), {
    ...OPTIONS,
    enabled,
  });
  useHotkeys('i>x', (e) => executeIssueAction(Actions.DeleteIssue, e), {
    ...OPTIONS,
    enabled,
  });

  // Select all visible issues
  useHotkeys(
    'mod+a',
    (e) => {
      if (!isKanbanRef.current) return;
      e.preventDefault();
      selectAllRef.current();
    },
    { scopes: [Scope.KANBAN], enabled }
  );

  // Clear selection on Escape
  useHotkeys(
    'escape',
    (e) => {
      if (!isKanbanRef.current) return;
      if (multiSelectedIssueIdsRef.current.size > 0) {
        e.preventDefault();
        e.stopPropagation();
        clearSelectionRef.current();
      }
    },
    { scopes: [Scope.KANBAN], enabled }
  );

  // Toggle current issue selection with X
  useHotkeys(
    'x',
    (e) => {
      if (!isKanbanRef.current) return;
      // Skip if part of a sequence (e.g. i>x for delete)
      if (sequencePendingRef.current) return;
      const currentIssueId = issueIdRef.current;
      if (!currentIssueId) return;
      e.preventDefault();
      toggleIssueRef.current(currentIssueId);
    },
    { scopes: [Scope.KANBAN], enabled }
  );

  // Extend selection with Shift+J / Shift+ArrowDown (select next issue)
  useHotkeys(
    'shift+j, shift+down',
    (e) => {
      if (!isKanbanRef.current) return;
      e.preventDefault();
      selectAdjacentRef.current('down', issueIdRef.current);
    },
    { scopes: [Scope.KANBAN], enabled }
  );

  // Extend selection with Shift+K / Shift+ArrowUp (select previous issue)
  useHotkeys(
    'shift+k, shift+up',
    (e) => {
      if (!isKanbanRef.current) return;
      e.preventDefault();
      selectAdjacentRef.current('up', issueIdRef.current);
    },
    { scopes: [Scope.KANBAN], enabled }
  );
}
