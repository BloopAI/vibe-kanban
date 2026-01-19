import { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNavigateWithSearch } from '@/hooks';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { attemptsApi, repoApi } from '@/lib/api';
import { WorkspaceContext } from '@/contexts/WorkspaceContext';
import { SearchableDropdownContainer } from '@/components/ui-new/containers/SearchableDropdownContainer';
import type { OpenPrInfo } from 'shared/types';

export interface CreateWorkspaceFromPrDialogProps {}

const CreateWorkspaceFromPrDialogImpl =
  NiceModal.create<CreateWorkspaceFromPrDialogProps>(() => {
    const modal = useModal();
    const navigate = useNavigateWithSearch();
    const { t } = useTranslation('tasks');
    const queryClient = useQueryClient();

    const workspaceContext = useContext(WorkspaceContext);
    const currentWorkspaceRepoId = workspaceContext?.repos[0]?.id ?? null;

    const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
    const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(
      null
    );
    const [runSetup, setRunSetup] = useState(true);

    const { data: repos = [], isLoading: isLoadingRepos } = useQuery({
      queryKey: ['repos'],
      queryFn: () => repoApi.list(),
      enabled: modal.visible,
    });

    useEffect(() => {
      if (selectedRepoId) return;
      if (
        currentWorkspaceRepoId &&
        repos.some((r) => r.id === currentWorkspaceRepoId)
      ) {
        setSelectedRepoId(currentWorkspaceRepoId);
      } else if (repos.length === 1) {
        setSelectedRepoId(repos[0].id);
      }
    }, [repos, selectedRepoId, currentWorkspaceRepoId]);

    const {
      data: prsResult,
      isLoading: isLoadingPrs,
      error: prsError,
    } = useQuery({
      queryKey: ['open-prs', selectedRepoId],
      queryFn: async () => {
        if (!selectedRepoId) return null;
        return repoApi.listOpenPrs(selectedRepoId);
      },
      enabled: modal.visible && !!selectedRepoId,
    });

    const openPrs: OpenPrInfo[] =
      prsResult?.success === true ? prsResult.data : [];

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
          prsErrorMessage = t(
            'createWorkspaceFromPr.errors.unsupportedProvider'
          );
          break;
        default:
          prsErrorMessage =
            prsResult.message ||
            t('createWorkspaceFromPr.errors.failedToLoadPrs');
      }
    } else if (prsError) {
      prsErrorMessage = t('createWorkspaceFromPr.errors.failedToLoadPrs');
    }

    const createMutation = useMutation({
      mutationFn: async () => {
        if (!selectedRepoId || !selectedPrNumber) {
          throw new Error('Missing required fields');
        }
        const result = await attemptsApi.createFromPr({
          repo_id: selectedRepoId,
          pr_number: selectedPrNumber as unknown as bigint,
          run_setup: runSetup,
        });
        if (!result.success) {
          switch (result.error?.type) {
            case 'branch_fetch_failed':
              throw new Error(result.error.message);
            case 'auth_failed':
              throw new Error(result.error.message);
            case 'cli_not_installed':
              throw new Error(
                t('createWorkspaceFromPr.errors.cliNotInstalled', {
                  provider: result.error.provider,
                })
              );
            case 'pr_not_found':
              throw new Error(t('createWorkspaceFromPr.errors.prNotFound'));
            case 'unsupported_provider':
              throw new Error(
                t('createWorkspaceFromPr.errors.unsupportedProvider')
              );
            case 'repo_not_in_project':
              throw new Error(
                t('createWorkspaceFromPr.errors.repoNotInProject')
              );
            default:
              throw new Error(
                result.message ||
                  t('createWorkspaceFromPr.errors.failedToCreateWorkspace')
              );
          }
        }
        return result.data;
      },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        modal.hide();
        navigate(`/workspaces/${data.workspace.id}`);
      },
    });

    useEffect(() => {
      if (!modal.visible) {
        setSelectedRepoId(null);
        setSelectedPrNumber(null);
        setRunSetup(true);
      }
    }, [modal.visible]);

    const handleOpenChange = (open: boolean) => {
      if (!open) modal.hide();
    };

    const canCreate =
      selectedRepoId &&
      selectedPrNumber &&
      !createMutation.isPending &&
      !isLoadingPrs;

    const handleCreate = () => {
      if (canCreate) {
        createMutation.mutate();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('createWorkspaceFromPr.title')}</DialogTitle>
            <DialogDescription>
              {t('createWorkspaceFromPr.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('createWorkspaceFromPr.repositoryLabel')}</Label>
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
                    setSelectedPrNumber(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('createWorkspaceFromPr.selectRepository')}
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

            <div className="space-y-2">
              <Label>{t('createWorkspaceFromPr.pullRequestLabel')}</Label>
              {isLoadingPrs ? (
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
                      className="w-full justify-start font-normal"
                    >
                      {selectedPrNumber
                        ? `#${selectedPrNumber}: ${openPrs.find((pr) => Number(pr.number) === selectedPrNumber)?.title ?? ''}`
                        : t('createWorkspaceFromPr.selectPullRequest')}
                    </Button>
                  }
                  contentClassName="w-[400px]"
                  placeholder={t('createWorkspaceFromPr.searchPrsPlaceholder')}
                  emptyMessage={t('createWorkspaceFromPr.noMatchingPrs')}
                  getItemBadge={null}
                />
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="run-setup"
                checked={runSetup}
                onCheckedChange={(checked) => setRunSetup(checked === true)}
              />
              <Label htmlFor="run-setup">
                {t('createWorkspaceFromPr.runSetupScript')}
              </Label>
            </div>

            {createMutation.error && (
              <div className="text-sm text-destructive">
                {createMutation.error.message}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => modal.hide()}
              disabled={createMutation.isPending}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!canCreate}>
              {createMutation.isPending
                ? t('createWorkspaceFromPr.creating')
                : t('createWorkspaceFromPr.createWorkspace')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

export const CreateWorkspaceFromPrDialog = defineModal<
  CreateWorkspaceFromPrDialogProps,
  void
>(CreateWorkspaceFromPrDialogImpl);
