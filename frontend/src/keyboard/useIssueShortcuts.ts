import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { useActions } from '@/contexts/ActionsContext';
import {
  Actions,
  type ActionDefinition,
  ActionTargetType,
} from '@/components/ui-new/actions';
import { Scope } from './registry';

const SEQUENCE_TIMEOUT_MS = 1500;

const OPTIONS = {
  scopes: [Scope.KANBAN],
  sequenceTimeout: SEQUENCE_TIMEOUT_MS,
} as const;

export function useIssueShortcuts() {
  const { executeAction } = useActions();
  const { projectId, issueId } = useParams<{
    projectId?: string;
    issueId?: string;
  }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isKanban = location.pathname.startsWith('/projects');
  const isCreatingIssue = searchParams.get('mode') === 'create';

  const executeActionRef = useRef(executeAction);
  const projectIdRef = useRef(projectId);
  const issueIdRef = useRef(issueId);
  const isKanbanRef = useRef(isKanban);
  const isCreatingIssueRef = useRef(isCreatingIssue);

  useEffect(() => {
    executeActionRef.current = executeAction;
    projectIdRef.current = projectId;
    issueIdRef.current = issueId;
    isKanbanRef.current = isKanban;
    isCreatingIssueRef.current = isCreatingIssue;
  });

  const issueIds = useMemo(
    () => (issueId ? [issueId] : []),
    [issueId]
  );
  const issueIdsRef = useRef(issueIds);
  useEffect(() => {
    issueIdsRef.current = issueIds;
  });

  const executeIssueAction = useCallback((action: ActionDefinition) => {
    if (!isKanbanRef.current) return;
    const currentProjectId = projectIdRef.current;
    const currentIssueIds = issueIdsRef.current;

    if (action.requiresTarget === ActionTargetType.ISSUE) {
      executeActionRef.current(
        action,
        undefined,
        currentProjectId,
        currentIssueIds
      );
    } else if (action.requiresTarget === ActionTargetType.NONE) {
      executeActionRef.current(action);
    }
  }, []);

  const enabled = isKanban;

  useHotkeys(
    'i>c',
    () => executeIssueAction(Actions.CreateIssue),
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>s',
    () => {
      if (isCreatingIssueRef.current) {
        executeIssueAction(Actions.ChangeNewIssueStatus);
      } else {
        executeIssueAction(Actions.ChangeIssueStatus);
      }
    },
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>p',
    () => {
      if (isCreatingIssueRef.current) {
        executeIssueAction(Actions.ChangeNewIssuePriority);
      } else {
        executeIssueAction(Actions.ChangePriority);
      }
    },
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>a',
    () => {
      if (isCreatingIssueRef.current) {
        executeIssueAction(Actions.ChangeNewIssueAssignees);
      } else {
        executeIssueAction(Actions.ChangeAssignees);
      }
    },
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>m',
    () => executeIssueAction(Actions.MakeSubIssueOf),
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>b',
    () => executeIssueAction(Actions.AddSubIssue),
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>u',
    () => executeIssueAction(Actions.RemoveParentIssue),
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>w',
    () => executeIssueAction(Actions.LinkWorkspace),
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>d',
    () => executeIssueAction(Actions.DuplicateIssue),
    { ...OPTIONS, enabled }
  );
  useHotkeys(
    'i>x',
    () => executeIssueAction(Actions.DeleteIssue),
    { ...OPTIONS, enabled }
  );
}
