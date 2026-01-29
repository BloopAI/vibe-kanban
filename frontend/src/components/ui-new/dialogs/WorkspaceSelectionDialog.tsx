import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { GitBranchIcon, PlusIcon } from '@phosphor-icons/react';
import { defineModal } from '@/lib/modals';
import { attemptsApi, tasksApi } from '@/lib/api';
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui-new/primitives/Command';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  ProjectProvider,
  useProjectContext,
} from '@/contexts/remote/ProjectContext';
import { UserProvider, useUserContext } from '@/contexts/remote/UserContext';

export interface WorkspaceSelectionDialogProps {
  projectId: string;
  issueId: string;
}

const PAGE_SIZE = 50;

/** Inner component that uses contexts to render the selection UI */
function WorkspaceSelectionContent({
  projectId,
  issueId,
}: {
  projectId: string;
  issueId: string;
}) {
  const { t } = useTranslation('common');
  const modal = useModal();
  const navigate = useNavigate();
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Get local workspaces from WorkspaceContext (both active and archived)
  const { activeWorkspaces, archivedWorkspaces } = useWorkspaceContext();

  // Get already-linked workspaces from UserContext (workspaces are user-scoped)
  const { getWorkspacesForIssue, workspaces } = useUserContext();

  // Get issue data from ProjectContext (issues are project-scoped)
  const { getIssue } = useProjectContext();

  const [search, setSearch] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  // Capture focus when dialog opens and reset state
  useEffect(() => {
    if (modal.visible) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setSearch('');
      setIsLinking(false);
    }
  }, [modal.visible]);

  // Get IDs of workspaces already linked to this issue
  const linkedLocalWorkspaceIds = useMemo(() => {
    const remoteWorkspaces = getWorkspacesForIssue(issueId);
    return new Set(
      remoteWorkspaces
        .map((w) => w.local_workspace_id)
        .filter((id): id is string => id !== null)
    );
  }, [getWorkspacesForIssue, issueId]);

  // Combine active and archived workspaces with archived flag
  const allWorkspaces = useMemo(() => {
    const active = activeWorkspaces.map((ws) => ({ ...ws, isArchived: false }));
    const archived = archivedWorkspaces.map((ws) => ({
      ...ws,
      isArchived: true,
    }));
    return [...active, ...archived];
  }, [activeWorkspaces, archivedWorkspaces]);

  // Filter and paginate workspaces
  const searchLower = search.toLowerCase();
  const isSearching = search.length > 0;

  const filteredWorkspaces = useMemo(() => {
    return allWorkspaces.filter((ws) => {
      // Exclude already-linked workspaces
      if (linkedLocalWorkspaceIds.has(ws.id)) return false;
      // Filter by search if searching
      if (isSearching) {
        return (
          ws.name.toLowerCase().includes(searchLower) ||
          ws.branch.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [allWorkspaces, linkedLocalWorkspaceIds, isSearching, searchLower]);

  // Apply pagination when not searching
  const displayedWorkspaces = useMemo(() => {
    return isSearching
      ? filteredWorkspaces
      : filteredWorkspaces.slice(0, PAGE_SIZE);
  }, [filteredWorkspaces, isSearching]);

  const handleLinkWorkspace = useCallback(
    async (workspaceId: string) => {
      if (isLinking) return;

      setIsLinking(true);
      try {
        await attemptsApi.linkToIssue(workspaceId, projectId, issueId);
        // Success - close dialog. UI will auto-update via Electric sync.
        modal.hide();
      } catch (err) {
        console.error('Error linking workspace:', err);
        // TODO: Show error toast
      } finally {
        setIsLinking(false);
      }
    },
    [projectId, issueId, isLinking, modal]
  );

  const handleCreateNewWorkspace = useCallback(async () => {
    if (isLinking) return;
    setIsLinking(true);

    try {
      // Get issue details for initial prompt
      const issue = getIssue(issueId);
      const initialPrompt = issue
        ? issue.description
          ? `${issue.title}\n\n${issue.description}`
          : issue.title
        : null;

      // Find most recent workspace in this project connected to an issue
      const connectedWorkspaces = workspaces
        .filter((w) => w.issue_id !== null && w.local_workspace_id !== null)
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      const mostRecentWorkspace = connectedWorkspaces[0];

      // Build navigation state
      const navigationState: {
        initialPrompt?: string | null;
        preferredRepos?: Array<{
          repo_id: string;
          target_branch: string | null;
        }>;
        project_id?: string | null;
      } = {
        initialPrompt,
        // project_id will be set from the most recent workspace's task
      };

      // If we have a recent workspace, fetch its repos AND local project
      if (mostRecentWorkspace?.local_workspace_id) {
        try {
          const [repos, localWorkspace] = await Promise.all([
            attemptsApi.getRepos(mostRecentWorkspace.local_workspace_id),
            attemptsApi.get(mostRecentWorkspace.local_workspace_id),
          ]);

          navigationState.preferredRepos = repos.map((r) => ({
            repo_id: r.id,
            target_branch: r.target_branch,
          }));

          // Get local project ID from the workspace's task
          const task = await tasksApi.getById(localWorkspace.task_id);
          navigationState.project_id = task.project_id;
        } catch (err) {
          console.warn('Failed to fetch workspace data:', err);
        }
      }

      // Navigate and close dialog
      modal.hide();
      navigate('/workspaces/create', { state: navigationState });
    } finally {
      setIsLinking(false);
    }
  }, [modal, navigate, getIssue, issueId, workspaces, isLinking]);

  // Restore focus when dialog closes
  const handleCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    previousFocusRef.current?.focus();
  }, []);

  // Prevent Radix from managing focus on open - let cmdk handle it
  const handleOpenAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  return (
    <CommandDialog
      open={modal.visible}
      onOpenChange={(open) => !open && modal.hide()}
      onCloseAutoFocus={handleCloseAutoFocus}
      onOpenAutoFocus={handleOpenAutoFocus}
    >
      <Command
        className="rounded-sm border border-border [&_[cmdk-group-heading]]:px-base [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-low [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-half [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-base [&_[cmdk-item]]:py-half"
        loop
        filter={(value, search) => {
          if (value.toLowerCase().includes(search.toLowerCase())) return 1;
          return 0;
        }}
      >
        <div className="flex items-center border-b border-border">
          <CommandInput
            placeholder={t('kanban.linkWorkspace', 'Link workspace...')}
            value={search}
            onValueChange={setSearch}
          />
        </div>
        <CommandList className="min-h-[200px]">
          <CommandEmpty>
            {t('commandBar.noResults', 'No results found')}
          </CommandEmpty>

          {/* Create new workspace option - stubbed */}
          <CommandGroup>
            <CommandItem
              value="__create_new__"
              onSelect={handleCreateNewWorkspace}
              disabled={isLinking}
            >
              <PlusIcon className="h-4 w-4" weight="bold" />
              <span>
                {t('kanban.createNewWorkspace', 'Create new workspace')}
              </span>
            </CommandItem>
          </CommandGroup>

          {/* Available workspaces */}
          {displayedWorkspaces.length > 0 && (
            <CommandGroup heading={t('kanban.workspaces', 'Workspaces')}>
              {displayedWorkspaces.map((workspace) => (
                <CommandItem
                  key={workspace.id}
                  value={`${workspace.id} ${workspace.name} ${workspace.branch}${workspace.isArchived ? ' archived' : ''}`}
                  onSelect={() => handleLinkWorkspace(workspace.id)}
                  disabled={isLinking}
                >
                  <GitBranchIcon
                    className={`h-4 w-4 shrink-0 ${workspace.isArchived ? 'text-low' : ''}`}
                    weight="regular"
                  />
                  <span
                    className={`truncate ${workspace.isArchived ? 'text-low' : ''}`}
                  >
                    {workspace.name}
                  </span>
                  {workspace.isArchived && (
                    <span className="text-xs text-low">(archived)</span>
                  )}
                  <span className="ml-auto text-xs text-low truncate max-w-[120px]">
                    {workspace.branch}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Show count when paginated */}
          {!isSearching && filteredWorkspaces.length > PAGE_SIZE && (
            <div className="px-base py-half text-xs text-low text-center">
              {t('kanban.showingWorkspaces', 'Showing {{count}} of {{total}}', {
                count: PAGE_SIZE,
                total: filteredWorkspaces.length,
              })}
            </div>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/** Wrapper that provides UserContext and ProjectContext */
function WorkspaceSelectionWithContext({
  projectId,
  issueId,
}: WorkspaceSelectionDialogProps) {
  if (!projectId) {
    return null;
  }

  return (
    <UserProvider>
      <ProjectProvider projectId={projectId}>
        <WorkspaceSelectionContent projectId={projectId} issueId={issueId} />
      </ProjectProvider>
    </UserProvider>
  );
}

const WorkspaceSelectionDialogImpl =
  NiceModal.create<WorkspaceSelectionDialogProps>(({ projectId, issueId }) => {
    return (
      <WorkspaceSelectionWithContext projectId={projectId} issueId={issueId} />
    );
  });

export const WorkspaceSelectionDialog = defineModal<
  WorkspaceSelectionDialogProps,
  void
>(WorkspaceSelectionDialogImpl);
