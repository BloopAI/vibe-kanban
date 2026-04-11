import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowSquareOut } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vibe/ui/components/KeyboardDialog';
import { Button } from '@vibe/ui/components/Button';
import { Input } from '@vibe/ui/components/Input';
import { Label } from '@vibe/ui/components/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vibe/ui/components/Select';
import { create, useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/shared/lib/modals';
import { repoApi, issuePrsApi } from '@/shared/lib/api';
import { ProjectProvider } from '@/shared/providers/remote/ProjectProvider';
import { useProjectContext } from '@/shared/hooks/useProjectContext';
import { SearchableDropdownContainer } from '@/shared/components/ui-new/containers/SearchableDropdownContainer';
import type { GitRemote, PullRequestDetail } from 'shared/types';
import type { PullRequestStatus } from 'shared/remote-types';

export interface LinkPrToIssueDialogProps {
  projectId: string;
  issueId: string;
}

type TabMode = 'url' | 'browse';

function LinkPrToIssueContent({ issueId }: { issueId: string }) {
  const modal = useModal();
  const { t } = useTranslation('tasks');

  const [activeTab, setActiveTab] = useState<TabMode>('url');

  // URL mode state
  const [prUrl, setPrUrl] = useState('');
  const [debouncedUrl, setDebouncedUrl] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Browse mode state
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [selectedRemote, setSelectedRemote] = useState<string | null>(null);
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);

  // Debounce URL changes
  const handleUrlChange = useCallback((value: string) => {
    setPrUrl(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedUrl(value.trim());
    }, 500);
  }, []);

  // Also trigger on blur immediately
  const handleUrlBlur = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setDebouncedUrl(prUrl.trim());
  }, [prUrl]);

  // Handle paste: immediately set the debounced URL
  const handleUrlPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').trim();
      if (pasted) {
        setPrUrl(pasted);
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        setDebouncedUrl(pasted);
      }
    },
    []
  );

  // Fetch PR info from URL
  const {
    data: prInfoResult,
    isLoading: isLoadingPrInfo,
    error: prInfoError,
  } = useQuery({
    queryKey: ['pr-info', debouncedUrl],
    queryFn: () => issuePrsApi.getPrInfo(debouncedUrl),
    enabled: modal.visible && activeTab === 'url' && debouncedUrl.length > 0,
  });

  const prInfo = useMemo<PullRequestDetail | null>(() => {
    if (!prInfoResult) return null;
    if (prInfoResult.success) return prInfoResult.data;
    return null;
  }, [prInfoResult]);

  const prInfoErrorMessage = useMemo<string | null>(() => {
    if (prInfoError) return t('linkPrToIssue.invalidUrl');
    if (prInfoResult && !prInfoResult.success) {
      return t('linkPrToIssue.invalidUrl');
    }
    return null;
  }, [prInfoError, prInfoResult, t]);

  // Browse mode queries
  const { data: repos = [], isLoading: isLoadingRepos } = useQuery({
    queryKey: ['repos'],
    queryFn: () => repoApi.list(),
    enabled: modal.visible && activeTab === 'browse',
  });

  useEffect(() => {
    if (activeTab !== 'browse' || selectedRepoId) return;
    if (repos.length === 1) {
      setSelectedRepoId(repos[0].id);
    }
  }, [repos, selectedRepoId, activeTab]);

  const { data: remotes = [], isLoading: isLoadingRemotes } = useQuery({
    queryKey: ['repo-remotes', selectedRepoId],
    queryFn: async () => {
      if (!selectedRepoId) return [];
      return repoApi.listRemotes(selectedRepoId);
    },
    enabled: modal.visible && activeTab === 'browse' && !!selectedRepoId,
  });

  useEffect(() => {
    if (remotes.length > 0 && !selectedRemote) {
      setSelectedRemote(remotes[0].name);
    }
  }, [remotes, selectedRemote]);

  const {
    data: prsResult,
    isLoading: isLoadingPrs,
    error: prsError,
  } = useQuery({
    queryKey: ['open-prs', selectedRepoId, selectedRemote],
    queryFn: async () => {
      if (!selectedRepoId || !selectedRemote) return null;
      return repoApi.listOpenPrs(selectedRepoId, selectedRemote);
    },
    enabled:
      modal.visible &&
      activeTab === 'browse' &&
      !!selectedRepoId &&
      !!selectedRemote,
  });

  const openPrs = useMemo<PullRequestDetail[]>(
    () => (prsResult?.success === true ? prsResult.data : []),
    [prsResult]
  );

  const selectedPr = useMemo(
    () => openPrs.find((pr) => Number(pr.number) === selectedPrNumber) ?? null,
    [openPrs, selectedPrNumber]
  );

  let prsErrorMessage: string | null = null;
  if (prsResult?.success === false) {
    switch (prsResult.error?.type) {
      case 'cli_not_installed':
        prsErrorMessage = t('createWorkspaceFromPr.errors.cliNotInstalled', {
          provider: prsResult.error.provider,
        });
        break;
      case 'auth_failed':
        prsErrorMessage = prsResult.error.message;
        break;
      case 'unsupported_provider':
        prsErrorMessage = t('createWorkspaceFromPr.errors.unsupportedProvider');
        break;
      default:
        prsErrorMessage =
          prsResult.message ||
          t('createWorkspaceFromPr.errors.failedToLoadPrs');
    }
  } else if (prsError) {
    prsErrorMessage = t('createWorkspaceFromPr.errors.failedToLoadPrs');
  }

  const { insertPullRequestIssue } = useProjectContext();
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!modal.visible) {
      setActiveTab('url');
      setPrUrl('');
      setDebouncedUrl('');
      setSelectedRepoId(null);
      setSelectedRemote(null);
      setSelectedPrNumber(null);
      setLinkError(null);
    }
  }, [modal.visible]);

  // Clean up debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) modal.hide();
  };

  const canLink =
    activeTab === 'url'
      ? !!prInfo && !isLinking
      : !!selectedPr && !isLinking && !isLoadingPrs;

  const handleLink = async () => {
    if (!canLink) return;
    const pr = activeTab === 'url' ? prInfo : selectedPr;
    if (!pr) return;

    const mergeStatusToApiStatus = (s: string): PullRequestStatus => {
      if (s === 'merged') return 'merged';
      if (s === 'closed') return 'closed';
      return 'open';
    };

    setIsLinking(true);
    setLinkError(null);
    try {
      const { persisted } = insertPullRequestIssue({
        issue_id: issueId,
        url: pr.url,
        number: Number(pr.number),
        status: mergeStatusToApiStatus(pr.status),
        merged_at: pr.merged_at,
        merge_commit_sha: pr.merge_commit_sha,
        target_branch_name: pr.base_branch,
      });
      await persisted;
      await issuePrsApi.linkToIssue({
        pr_url: pr.url,
        pr_number: Number(pr.number),
        base_branch: pr.base_branch,
      });
      modal.hide();
    } catch (err) {
      setLinkError(
        err instanceof Error ? err.message : t('linkPrToIssue.errors.failed')
      );
    } finally {
      setIsLinking(false);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'open':
        return t('linkPrToIssue.status.open', 'Open');
      case 'merged':
        return t('linkPrToIssue.status.merged', 'Merged');
      case 'closed':
        return t('linkPrToIssue.status.closed', 'Closed');
      default:
        return t('linkPrToIssue.status.unknown', 'Unknown');
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'text-green-600 dark:text-green-400';
      case 'merged':
        return 'text-purple-600 dark:text-purple-400';
      case 'closed':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('linkPrToIssue.title')}</DialogTitle>
          <DialogDescription>
            {t('linkPrToIssue.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tab switcher */}
          <div className="flex gap-1 rounded-md bg-muted p-1">
            <button
              type="button"
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'url'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('url')}
            >
              {t('linkPrToIssue.urlTab')}
            </button>
            <button
              type="button"
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'browse'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('browse')}
            >
              {t('linkPrToIssue.browseTab')}
            </button>
          </div>

          {/* URL mode */}
          {activeTab === 'url' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{t('linkPrToIssue.urlLabel', 'Pull Request URL')}</Label>
                <Input
                  placeholder={t('linkPrToIssue.urlPlaceholder')}
                  value={prUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  onBlur={handleUrlBlur}
                  onPaste={handleUrlPaste}
                />
              </div>

              {isLoadingPrInfo && (
                <div className="text-sm text-muted-foreground">
                  {t('linkPrToIssue.loadingPrInfo')}
                </div>
              )}

              {prInfoErrorMessage && debouncedUrl.length > 0 && (
                <div className="text-sm text-destructive">
                  {prInfoErrorMessage}
                </div>
              )}

              {prInfo && (
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      #{String(prInfo.number)}
                      {prInfo.title ? `: ${prInfo.title}` : ''}
                    </span>
                    <a
                      href={prInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowSquareOut className="size-4" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={statusColor(prInfo.status)}>
                      {statusLabel(prInfo.status)}
                    </span>
                    {prInfo.base_branch && (
                      <span className="text-muted-foreground">
                        {t('linkPrToIssue.baseBranch', 'Base:')}{' '}
                        {prInfo.base_branch}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Browse mode */}
          {activeTab === 'browse' && (
            <div className="space-y-3">
              {/* Repository selector */}
              <div className="space-y-2">
                <Label>{t('linkPrToIssue.repositoryLabel')}</Label>
                {isLoadingRepos ? (
                  <div className="text-sm text-muted-foreground">
                    {t('createWorkspaceFromPr.loadingRepositories')}
                  </div>
                ) : repos.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {t('createWorkspaceFromPr.noRepositoriesFound')}
                  </div>
                ) : (
                  <Select
                    value={selectedRepoId ?? undefined}
                    onValueChange={(value) => {
                      setSelectedRepoId(value);
                      setSelectedRemote(null);
                      setSelectedPrNumber(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t(
                          'createWorkspaceFromPr.selectRepository'
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo.id} value={repo.id}>
                          {repo.display_name || repo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Remote selector (only if multiple remotes) */}
              {selectedRepoId && remotes.length > 1 && (
                <div className="space-y-2">
                  <Label>{t('linkPrToIssue.remoteLabel')}</Label>
                  {isLoadingRemotes ? (
                    <div className="text-sm text-muted-foreground">
                      {t('createWorkspaceFromPr.loadingRemotes')}
                    </div>
                  ) : (
                    <Select
                      value={selectedRemote ?? undefined}
                      onValueChange={(value) => {
                        setSelectedRemote(value);
                        setSelectedPrNumber(null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t('createWorkspaceFromPr.selectRemote')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {remotes.map((remote: GitRemote, index: number) => (
                          <SelectItem key={remote.name} value={remote.name}>
                            {remote.name}
                            {index === 0 &&
                              ` (${t('createWorkspaceFromPr.default')})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* PR searchable dropdown */}
              <div className="space-y-2">
                <Label>{t('linkPrToIssue.pullRequestLabel')}</Label>
                {isLoadingPrs || isLoadingRemotes ? (
                  <div className="text-sm text-muted-foreground">
                    {t('createWorkspaceFromPr.loadingPullRequests')}
                  </div>
                ) : prsErrorMessage ? (
                  <div className="text-sm text-destructive">
                    {prsErrorMessage}
                  </div>
                ) : !selectedRepoId ? (
                  <div className="text-sm text-muted-foreground">
                    {t('createWorkspaceFromPr.selectRepositoryFirst')}
                  </div>
                ) : openPrs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {t('createWorkspaceFromPr.noPullRequestsFound')}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <SearchableDropdownContainer
                      items={openPrs}
                      selectedValue={selectedPrNumber?.toString() ?? null}
                      getItemKey={(pr) => String(pr.number)}
                      getItemLabel={(pr) => `#${pr.number}: ${pr.title}`}
                      filterItem={(pr, query) =>
                        String(pr.number).includes(query) ||
                        pr.title.toLowerCase().includes(query)
                      }
                      onSelect={(pr) => setSelectedPrNumber(Number(pr.number))}
                      trigger={
                        <Button
                          variant="outline"
                          className="flex-1 justify-start font-normal min-w-0"
                        >
                          <span className="truncate">
                            {selectedPr
                              ? `#${selectedPr.number}: ${selectedPr.title}`
                              : t('createWorkspaceFromPr.selectPullRequest')}
                          </span>
                        </Button>
                      }
                      contentClassName="w-[400px]"
                      placeholder={t(
                        'createWorkspaceFromPr.searchPrsPlaceholder'
                      )}
                      emptyMessage={t('createWorkspaceFromPr.noMatchingPrs')}
                      getItemBadge={(pr) => statusLabel(pr.status)}
                      getItemIcon={null}
                    />
                    {selectedPr && (
                      <a
                        href={selectedPr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-2 text-muted-foreground hover:text-foreground transition-colors"
                        title={t('createWorkspaceFromPr.openPrInBrowser')}
                      >
                        <ArrowSquareOut className="size-4" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error message */}
          {linkError && (
            <div className="text-sm text-destructive">{linkError}</div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => modal.hide()}
            disabled={isLinking}
          >
            {t('common:buttons.cancel')}
          </Button>
          <Button onClick={handleLink} disabled={!canLink}>
            {isLinking ? t('linkPrToIssue.linking') : t('linkPrToIssue.linkPr')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkPrToIssueWithContext({
  projectId,
  issueId,
}: LinkPrToIssueDialogProps) {
  if (!projectId) {
    return null;
  }

  return (
    <ProjectProvider projectId={projectId}>
      <LinkPrToIssueContent issueId={issueId} />
    </ProjectProvider>
  );
}

const LinkPrToIssueDialogImpl = create<LinkPrToIssueDialogProps>(
  ({ projectId, issueId }) => {
    return <LinkPrToIssueWithContext projectId={projectId} issueId={issueId} />;
  }
);

export const LinkPrToIssueDialog = defineModal<LinkPrToIssueDialogProps, void>(
  LinkPrToIssueDialogImpl
);
