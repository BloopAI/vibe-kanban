import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Loader2, Github } from 'lucide-react';
import { useProjectRepos } from '@/hooks/useProjectRepos';
import { useGitHubIssues, useImportGitHubIssues } from '@/hooks/useGitHubIssues';

export interface ImportGitHubIssuesDialogProps {
  projectId: string;
}

export interface ImportGitHubIssuesDialogResult {
  imported: boolean;
  count: number;
}

type IssueState = 'open' | 'closed' | 'all';

const ImportGitHubIssuesDialogImpl = NiceModal.create<ImportGitHubIssuesDialogProps>(
  ({ projectId }) => {
    const { t } = useTranslation(['tasks', 'common']);
    const modal = useModal();

    // State
    const [selectedRepoId, setSelectedRepoId] = useState<string | undefined>();
    const [issueState, setIssueState] = useState<IssueState>('open');
    const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set());
    const [isImporting, setIsImporting] = useState(false);

    // Fetch repos for the project
    const { data: repos, isLoading: isLoadingRepos } = useProjectRepos(projectId);

    // Fetch GitHub issues for the selected repo
    const {
      data: issues,
      isLoading: isLoadingIssues,
      isError,
      error,
    } = useGitHubIssues(projectId, selectedRepoId, issueState, !!selectedRepoId);

    // Import mutation
    const importMutation = useImportGitHubIssues(projectId);

    // Auto-select first repo if only one
    useEffect(() => {
      if (repos?.length === 1 && !selectedRepoId) {
        setSelectedRepoId(repos[0].id);
      }
    }, [repos, selectedRepoId]);

    // Reset selection when repo or state changes
    useEffect(() => {
      setSelectedIssues(new Set());
    }, [selectedRepoId, issueState]);

    const toggleSelection = (issueNumber: number) => {
      setSelectedIssues((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(issueNumber)) {
          newSet.delete(issueNumber);
        } else {
          newSet.add(issueNumber);
        }
        return newSet;
      });
    };

    const selectAll = () => {
      if (issues) {
        setSelectedIssues(new Set(issues.map((i) => Number(i.number))));
      }
    };

    const deselectAll = () => {
      setSelectedIssues(new Set());
    };

    const isAllSelected =
      issues && issues.length > 0 && selectedIssues.size === issues.length;

    const handleImport = async () => {
      if (!selectedRepoId || !issues || selectedIssues.size === 0) return;

      setIsImporting(true);
      try {
        const issuesToImport = issues
          .filter((i) => selectedIssues.has(Number(i.number)))
          .map((i) => ({
            number: i.number,
            title: i.title,
            body: i.body,
          }));

        const result = await importMutation.mutateAsync({
          repo_id: selectedRepoId,
          issues: issuesToImport,
        });

        modal.resolve({
          imported: true,
          count: Number(result.created_count),
        });
        modal.hide();
      } catch (err) {
        console.error('Failed to import issues:', err);
        setIsImporting(false);
      }
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        modal.resolve({ imported: false, count: 0 });
        modal.hide();
      }
    };

    const errorMessage = isError ? getErrorMessage(error) : null;

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-2xl p-0"
          onKeyDownCapture={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              modal.resolve({ imported: false, count: 0 });
              modal.hide();
            }
          }}
        >
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              Import GitHub Issues
            </DialogTitle>
            <DialogDescription>
              Select issues from a GitHub repository to import as tasks
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 py-3 border-b space-y-3">
            {/* Repository Selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium w-24">Repository</label>
              <Select
                value={selectedRepoId}
                onValueChange={setSelectedRepoId}
                disabled={isLoadingRepos}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a repository" />
                </SelectTrigger>
                <SelectContent>
                  {repos?.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id}>
                      {repo.display_name || repo.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* State Filter */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium w-24">State</label>
              <div className="flex gap-2">
                {(['open', 'closed', 'all'] as IssueState[]).map((state) => (
                  <Button
                    key={state}
                    variant={issueState === state ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIssueState(state)}
                  >
                    {state.charAt(0).toUpperCase() + state.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-h-[50vh] flex flex-col min-h-0">
            <div className="p-4 overflow-auto flex-1 min-h-0">
              {!selectedRepoId ? (
                <p className="text-center text-muted-foreground py-8">
                  Select a repository to view issues
                </p>
              ) : errorMessage ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : isLoadingIssues ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !issues || issues.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No {issueState === 'all' ? '' : issueState} issues found
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground">
                      {selectedIssues.size} of {issues.length} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={isAllSelected ? deselectAll : selectAll}
                    >
                      {isAllSelected ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {issues.map((issue) => {
                      const issueNum = Number(issue.number);
                      return (
                        <div
                          key={issueNum}
                          className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleSelection(issueNum)}
                        >
                          <Checkbox
                            checked={selectedIssues.has(issueNum)}
                            onCheckedChange={() => toggleSelection(issueNum)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-sm">
                                #{String(issue.number)}
                              </span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  issue.state === 'open'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                    : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                                }`}
                              >
                                {issue.state}
                              </span>
                            </div>
                            <p className="font-medium truncate">{issue.title}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="px-4 py-3 border-t">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isImporting}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              onClick={handleImport}
              disabled={selectedIssues.size === 0 || isImporting}
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  Import {selectedIssues.size > 0 ? `(${selectedIssues.size})` : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message);
  }
  return 'Failed to load GitHub issues. Make sure the repository is on GitHub and gh CLI is authenticated.';
}

export const ImportGitHubIssuesDialog = defineModal<
  ImportGitHubIssuesDialogProps,
  ImportGitHubIssuesDialogResult
>(ImportGitHubIssuesDialogImpl);
