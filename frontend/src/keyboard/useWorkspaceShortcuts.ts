import { useCallback, useRef, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useActions } from '@/contexts/ActionsContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { Actions, type ActionDefinition } from '@/components/ui-new/actions';
import { Scope } from './registry';

const SEQUENCE_TIMEOUT_MS = 1500;

const OPTIONS = {
  scopes: [Scope.WORKSPACE],
  sequenceTimeout: SEQUENCE_TIMEOUT_MS,
} as const;

export function useWorkspaceShortcuts() {
  const { executeAction } = useActions();
  const { workspaceId, repos } = useWorkspaceContext();

  const workspaceIdRef = useRef(workspaceId);
  const reposRef = useRef(repos);
  const executeActionRef = useRef(executeAction);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
    reposRef.current = repos;
    executeActionRef.current = executeAction;
  });

  const execute = useCallback((action: ActionDefinition) => {
    const currentWorkspaceId = workspaceIdRef.current;
    const currentRepos = reposRef.current;
    const currentExecuteAction = executeActionRef.current;
    const firstRepoId = currentRepos?.[0]?.id;

    if (action.requiresTarget === 'git') {
      currentExecuteAction(action, currentWorkspaceId, firstRepoId);
    } else if (action.requiresTarget === true) {
      currentExecuteAction(action, currentWorkspaceId);
    } else {
      currentExecuteAction(action);
    }
  }, []);

  useHotkeys('g>s', () => execute(Actions.Settings), OPTIONS);
  useHotkeys('g>n', () => execute(Actions.NewWorkspace), OPTIONS);

  useHotkeys('w>d', () => execute(Actions.DuplicateWorkspace), OPTIONS);
  useHotkeys('w>r', () => execute(Actions.RenameWorkspace), OPTIONS);
  useHotkeys('w>p', () => execute(Actions.PinWorkspace), OPTIONS);
  useHotkeys('w>a', () => execute(Actions.ArchiveWorkspace), OPTIONS);
  useHotkeys('w>x', () => execute(Actions.DeleteWorkspace), OPTIONS);

  useHotkeys('v>c', () => execute(Actions.ToggleChangesMode), OPTIONS);
  useHotkeys('v>l', () => execute(Actions.ToggleLogsMode), OPTIONS);
  useHotkeys('v>p', () => execute(Actions.TogglePreviewMode), OPTIONS);
  useHotkeys('v>s', () => execute(Actions.ToggleLeftSidebar), OPTIONS);
  useHotkeys('v>h', () => execute(Actions.ToggleLeftMainPanel), OPTIONS);

  useHotkeys('x>p', () => execute(Actions.GitCreatePR), OPTIONS);
  useHotkeys('x>m', () => execute(Actions.GitMerge), OPTIONS);
  useHotkeys('x>r', () => execute(Actions.GitRebase), OPTIONS);
  useHotkeys('x>u', () => execute(Actions.GitPush), OPTIONS);

  useHotkeys('y>p', () => execute(Actions.CopyWorkspacePath), OPTIONS);
  useHotkeys('y>l', () => execute(Actions.CopyRawLogs), OPTIONS);

  useHotkeys('t>d', () => execute(Actions.ToggleDevServer), OPTIONS);
  useHotkeys('t>w', () => execute(Actions.ToggleWrapLines), OPTIONS);

  useHotkeys('r>s', () => execute(Actions.RunSetupScript), OPTIONS);
  useHotkeys('r>c', () => execute(Actions.RunCleanupScript), OPTIONS);
}
