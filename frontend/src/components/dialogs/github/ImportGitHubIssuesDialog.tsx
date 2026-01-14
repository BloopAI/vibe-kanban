import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { Github, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { defineModal } from '@/lib/modals';
import { githubApi, tasksApi } from '@/lib/api';
import { useProjectRepos } from '@/hooks';
import type { GitHubIssueResponse } from 'shared/types';

export interface ImportGitHubIssuesDialogProps {
  projectId: string;
}

type IssueState = 'open' | 'closed' | 'all';

const ImportGitHubIssuesDialogImpl =
  NiceModal.create<ImportGitHubIssuesDialogProps>(({ projectId }) => {
    const modal = useModal();
    const queryClient = useQueryClient();

    // State - use string set to avoid bigint/number issues
    const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
    const [issueState, setIssueState] = useState<IssueState>('open');
    const [selectedIssueNumbers, setSelectedIssueNumbers] = useState<
      Set<string>
    >(new Set());

    // Fetch project repos
    const { data: repos = [], isLoading: reposLoading } = useProjectRepos(
      projectId,
      { enabled: modal.visible }
    );

    // Auto-select first repo
    const activeRepoId = useMemo(() => {
      if (selectedRepoId) return selectedRepoId;
      if (repos.length === 1) return repos[0].id;
      return null;
    }, [selectedRepoId, repos]);

    // Fetch GitHub issues
    const {
      data: issues = [],
      isLoading: issuesLoading,
      error: issuesError,
    } = useQuery({
      queryKey: ['github-issues', activeRepoId, issueState],
      queryFn: () => githubApi.listIssues(activeRepoId!, issueState, 100),
      enabled: modal.visible && !!activeRepoId,
      staleTime: 30000, // 30 seconds
    });

    // Fetch repo info for external_ref and to check if it's a GitHub repo
    const {
      data: repoInfo,
      isLoading: repoInfoLoading,
      error: repoInfoError,
    } = useQuery({
      queryKey: ['github-repo-info', activeRepoId],
      queryFn: () => githubApi.getRepoInfo(activeRepoId!),
      enabled: modal.visible && !!activeRepoId,
    });

    // Import mutation
    const importMutation = useMutation({
      mutationFn: async (issuesToImport: GitHubIssueResponse[]) => {
        const results = await Promise.all(
          issuesToImport.map((issue) =>
            tasksApi.create({
              project_id: projectId,
              title: `#${issue.number} ${issue.title}`,
              description: issue.body || null,
              status: issue.state === 'OPEN' ? 'todo' : 'done',
              parent_workspace_id: null,
              image_ids: null,
              shared_task_id: null,
              source: 'github',
              external_ref: repoInfo
                ? `github:${repoInfo.owner}/${repoInfo.repo_name}#${issue.number}`
                : null,
            })
          )
        );
        return results;
      },
      onSuccess: () => {
        // Invalidate tasks query to refresh the board
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
        modal.remove();
      },
    });

    // Selection handlers - use string representation for bigint compatibility
    const toggleIssue = useCallback((issueNumber: bigint) => {
      const key = String(issueNumber);
      setSelectedIssueNumbers((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    }, []);

    const selectAll = useCallback(() => {
      setSelectedIssueNumbers(new Set(issues.map((i) => String(i.number))));
    }, [issues]);

    const selectNone = useCallback(() => {
      setSelectedIssueNumbers(new Set());
    }, []);

    // Import handler
    const handleImport = useCallback(() => {
      const issuesToImport = issues.filter((i) =>
        selectedIssueNumbers.has(String(i.number))
      );
      importMutation.mutate(issuesToImport);
    }, [issues, selectedIssueNumbers, importMutation]);

    const handleClose = () => {
      modal.remove();
    };

    const isLoading = reposLoading || issuesLoading || repoInfoLoading;
    const hasIssues = issues.length > 0;
    const hasSelection = selectedIssueNumbers.size > 0;

    // Check if repo info failed (not a GitHub repo or other error)
    const isNotGitHubRepo = !repoInfoLoading && repoInfoError;

    return (
      <Dialog open={modal.visible} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Github className="h-6 w-6" />
              <DialogTitle>Import GitHub Issues</DialogTitle>
            </div>
            <DialogDescription>
              Import issues from your repository as tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 flex flex-col gap-4 py-4">
            {/* Repository selector (if multiple repos) */}
            {repos.length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Repository</label>
                <Select
                  value={activeRepoId || ''}
                  onValueChange={setSelectedRepoId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a repository" />
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((repo) => (
                      <SelectItem key={repo.id} value={repo.id}>
                        {repo.display_name || repo.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* State filter */}
            {activeRepoId && !isNotGitHubRepo && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Show:</label>
                  <Select
                    value={issueState}
                    onValueChange={(v) => setIssueState(v as IssueState)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {hasIssues && (
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={selectAll}>
                      Select all
                    </Button>
                    <Button variant="ghost" size="sm" onClick={selectNone}>
                      Select none
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Error state */}
            {issuesError && !isNotGitHubRepo && (
              <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <div className="text-sm">
                  {(issuesError as Error).message ||
                    'Failed to load issues. Make sure you have the GitHub CLI installed and authenticated.'}
                </div>
              </div>
            )}

            {/* Not a GitHub repo warning */}
            {activeRepoId && isNotGitHubRepo && !issuesLoading && (
              <div className="flex items-center gap-2 p-4 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 rounded-md">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <div className="text-sm">
                  This repository does not appear to be hosted on GitHub. Make
                  sure the repository has a GitHub remote configured.
                </div>
              </div>
            )}

            {/* Empty state */}
            {!isLoading &&
              !issuesError &&
              activeRepoId &&
              !hasIssues &&
              !isNotGitHubRepo && (
                <div className="text-center py-8 text-muted-foreground">
                  No {issueState === 'all' ? '' : issueState} issues found.
                </div>
              )}

            {/* Issues list */}
            {!isLoading && hasIssues && (
              <div className="flex-1 min-h-0 overflow-y-auto border rounded-md">
                <div className="divide-y">
                  {issues.map((issue) => (
                    <IssueRow
                      key={String(issue.number)}
                      issue={issue}
                      selected={selectedIssueNumbers.has(String(issue.number))}
                      onToggle={() => toggleIssue(issue.number)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!hasSelection || importMutation.isPending}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${selectedIssueNumbers.size} issue${selectedIssueNumbers.size !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

interface IssueRowProps {
  issue: GitHubIssueResponse;
  selected: boolean;
  onToggle: () => void;
}

function IssueRow({ issue, selected, onToggle }: IssueRowProps) {
  return (
    <div
      className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer"
      onClick={onToggle}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            #{String(issue.number)}
          </span>
          <span className="text-sm font-medium truncate">{issue.title}</span>
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground ml-auto flex-shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        {issue.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {issue.labels.map((label) => (
              <span
                key={label}
                className="text-xs px-1.5 py-0.5 bg-muted rounded"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
      <span
        className={`text-xs px-2 py-0.5 rounded ${
          issue.state === 'OPEN'
            ? 'bg-green-500/20 text-green-700 dark:text-green-400'
            : 'bg-purple-500/20 text-purple-700 dark:text-purple-400'
        }`}
      >
        {issue.state.toLowerCase()}
      </span>
    </div>
  );
}

export const ImportGitHubIssuesDialog = defineModal<
  ImportGitHubIssuesDialogProps,
  void
>(ImportGitHubIssuesDialogImpl);
