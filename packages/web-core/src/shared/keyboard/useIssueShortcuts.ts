import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams, useLocation } from '@tanstack/react-router';
import { useHotkeys } from 'react-hotkeys-hook';
import { useActions } from '@/shared/hooks/useActions';
import { useUserContext } from '@/shared/hooks/useUserContext';
import { useKanbanNavigation } from '@/shared/hooks/useKanbanNavigation';
import { Actions } from '@/shared/actions';
import {
  type ActionDefinition,
  ActionTargetType,
} from '@/shared/types/actions';
import { Scope } from '@/shared/keyboard/registry';
import type { Workspace as RemoteWorkspace } from 'shared/remote-types';

const SEQUENCE_TIMEOUT_MS = 1500;

const OPTIONS = {
  scopes: [Scope.KANBAN],
  sequenceTimeout: SEQUENCE_TIMEOUT_MS,
} as const;

export function useIssueShortcuts() {
  const { executeAction } = useActions();
  const { projectId, issueId, workspaceId } = useParams({ strict: false });
  const location = useLocation();
  const { workspaces } = useUserContext();
  const { openIssueWorkspace } = useKanbanNavigation();

  const isKanban = location.pathname.startsWith('/projects');
  // Detect create mode from the URL path (e.g. /projects/:id/issues/new)
  // NOT from ?mode=create searchParam which is a legacy format
  const isCreatingIssue = location.pathname.endsWith('/issues/new');

  const executeActionRef = useRef(executeAction);
  const projectIdRef = useRef(projectId);
  const issueIdRef = useRef(issueId);
  const workspaceIdRef = useRef(workspaceId);
  const workspacesRef = useRef(workspaces);
  const openIssueWorkspaceRef = useRef(openIssueWorkspace);
  const isKanbanRef = useRef(isKanban);
  const isCreatingIssueRef = useRef(isCreatingIssue);

  useEffect(() => {
    executeActionRef.current = executeAction;
    projectIdRef.current = projectId;
    issueIdRef.current = issueId;
    workspaceIdRef.current = workspaceId;
    workspacesRef.current = workspaces;
    openIssueWorkspaceRef.current = openIssueWorkspace;
    isKanbanRef.current = isKanban;
    isCreatingIssueRef.current = isCreatingIssue;
  });

  const issueIds = useMemo(() => (issueId ? [issueId] : []), [issueId]);
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

  const getLinkedLocalWorkspaceIds = useCallback(
    (currentProjectId: string, currentIssueId: string): string[] => {
      return workspacesRef.current
        .filter(
          (workspace) =>
            workspace.project_id === currentProjectId &&
            workspace.issue_id === currentIssueId &&
            workspace.local_workspace_id !== null
        )
        .sort((a: RemoteWorkspace, b: RemoteWorkspace) =>
          b.updated_at.localeCompare(a.updated_at)
        )
        .map((workspace) => workspace.local_workspace_id as string);
    },
    []
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
  useHotkeys(
    'i>o',
    (e) => {
      if (!isKanbanRef.current) return;
      e?.preventDefault();
      const currentProjectId = projectIdRef.current;
      const currentIssueId = issueIdRef.current;
      if (!currentProjectId || !currentIssueId) return;
      const linkedWorkspaceIds = getLinkedLocalWorkspaceIds(
        currentProjectId,
        currentIssueId
      );
      const firstWorkspaceId = linkedWorkspaceIds[0];
      if (!firstWorkspaceId) return;
      openIssueWorkspaceRef.current(currentIssueId, firstWorkspaceId);
    },
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>j',
    (e) => {
      if (!isKanbanRef.current) return;
      e?.preventDefault();
      const currentProjectId = projectIdRef.current;
      const currentIssueId = issueIdRef.current;
      if (!currentProjectId || !currentIssueId) return;
      const linkedWorkspaceIds = getLinkedLocalWorkspaceIds(
        currentProjectId,
        currentIssueId
      );
      if (linkedWorkspaceIds.length === 0) return;
      const currentWorkspaceId = workspaceIdRef.current;
      const currentIndex = currentWorkspaceId
        ? linkedWorkspaceIds.indexOf(currentWorkspaceId)
        : -1;
      const nextWorkspaceId =
        currentIndex === -1
          ? linkedWorkspaceIds[0]
          : linkedWorkspaceIds[(currentIndex + 1) % linkedWorkspaceIds.length];
      openIssueWorkspaceRef.current(currentIssueId, nextWorkspaceId);
    },
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>k',
    (e) => {
      if (!isKanbanRef.current) return;
      e?.preventDefault();
      const currentProjectId = projectIdRef.current;
      const currentIssueId = issueIdRef.current;
      if (!currentProjectId || !currentIssueId) return;
      const linkedWorkspaceIds = getLinkedLocalWorkspaceIds(
        currentProjectId,
        currentIssueId
      );
      if (linkedWorkspaceIds.length === 0) return;
      const currentWorkspaceId = workspaceIdRef.current;
      const currentIndex = currentWorkspaceId
        ? linkedWorkspaceIds.indexOf(currentWorkspaceId)
        : -1;
      const previousWorkspaceId =
        currentIndex === -1
          ? linkedWorkspaceIds[linkedWorkspaceIds.length - 1]
          : linkedWorkspaceIds[
              (currentIndex - 1 + linkedWorkspaceIds.length) %
                linkedWorkspaceIds.length
            ];
      openIssueWorkspaceRef.current(currentIssueId, previousWorkspaceId);
    },
    { ...OPTIONS, enabled }
  );
  useHotkeys('i>d', (e) => executeIssueAction(Actions.DuplicateIssue, e), {
    ...OPTIONS,
    enabled,
  });
  useHotkeys('i>x', (e) => executeIssueAction(Actions.DeleteIssue, e), {
    ...OPTIONS,
    enabled,
  });
}
