import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Plus,
  Github,
  Link,
  Unlink,
  ExternalLink,
  Lock,
  Globe,
  RefreshCw,
  Search,
  FolderSync,
  Folder,
  Users,
  CheckSquare,
  Square,
  ArrowUpDown,
  Check,
} from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';
import { useTranslation } from 'react-i18next';
import {
  useWorkspaceGitHubConnection,
  useWorkspaceAvailableGitHubRepos,
  useWorkspaceGitHubMutations,
} from '@/hooks/useWorkspaceGitHub';
import { useTeams } from '@/hooks/useTeams';
import { useDocuments } from '@/hooks/useDocuments';
import { teamsApi } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import type { GitHubRepository, CreateRepoSyncConfig } from 'shared/types';

export function OrganizationSettings() {
  const { t } = useTranslation('organization');
  const { isLoaded } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // GitHub integration state
  const [showLinkRepoDialog, setShowLinkRepoDialog] = useState(false);
  const [repoToUnlink, setRepoToUnlink] = useState<string | null>(null);
  const [repoSearchQuery, setRepoSearchQuery] = useState('');

  // Sync configuration state
  const [repoToConfigureSync, setRepoToConfigureSync] = useState<GitHubRepository | null>(null);
  const [selectedTeamIdForSync, setSelectedTeamIdForSync] = useState<string | null>(null);
  const [folderSyncConfigs, setFolderSyncConfigs] = useState<Array<{
    folderId: string;
    folderName: string;
    selected: boolean;
    githubPath: string;
  }>>([]);
  const [isLoadingSyncConfigs, setIsLoadingSyncConfigs] = useState(false);
  const [isConfiguringSync, setIsConfiguringSync] = useState(false);

  // Bidirectional sync state
  const [syncingRepoId, setSyncingRepoId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ repoId: string; pulled: number; pushed: number } | null>(null);

  // GitHub integration hooks
  const {
    data: githubConnection,
    isLoading: loadingGitHubConnection,
    refetch: refetchGitHubConnection,
  } = useWorkspaceGitHubConnection();

  const {
    data: availableRepos = [],
    isLoading: loadingAvailableRepos,
    refetch: refetchAvailableRepos,
  } = useWorkspaceAvailableGitHubRepos(!!githubConnection);

  const {
    linkRepository: linkGitHubRepository,
    unlinkRepository: unlinkGitHubRepository,
    syncRepository,
  } = useWorkspaceGitHubMutations();

  // Teams for sync configuration
  const { teams } = useTeams();

  // Documents for selected team (for sync config)
  const { folders: teamFolders, isLoading: isLoadingTeamFolders } = useDocuments(selectedTeamIdForSync || '');

  // GitHub handlers
  const handleLinkRepo = async (repo: { name: string; full_name: string; html_url: string; default_branch: string | null; private: boolean }) => {
    try {
      // Parse owner from full_name (e.g., "owner/repo")
      const [owner] = repo.full_name.split('/');
      await linkGitHubRepository.mutateAsync({
        repo_name: repo.name,
        repo_full_name: repo.full_name,
        repo_owner: owner,
        repo_url: repo.html_url,
        default_branch: repo.default_branch,
        is_private: repo.private,
      });
      setShowLinkRepoDialog(false);
      setSuccess(`Repository ${repo.name} linked successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link repository');
    }
  };

  const handleUnlinkRepo = async () => {
    if (!repoToUnlink) return;
    try {
      await unlinkGitHubRepository.mutateAsync(repoToUnlink);
      setRepoToUnlink(null);
      setSuccess('Repository unlinked successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink repository');
    }
  };

  // Bidirectional sync handler
  const handleSyncRepo = async (repoId: string) => {
    // Get the first team that has sync configs for this repo
    // For simplicity, we use the first team - in a more complete implementation
    // you might want to let the user choose which team to sync
    if (teams.length === 0) {
      setError('No teams available for sync');
      return;
    }

    setSyncingRepoId(repoId);
    setSyncResult(null);
    setError(null);

    try {
      // Try each team until we find one with sync configs
      let syncSucceeded = false;
      for (const team of teams) {
        try {
          const result = await syncRepository.mutateAsync({ teamId: team.id, repoId });
          setSyncResult({
            repoId,
            pulled: result.pulled.files_synced,
            pushed: result.pushed.files_synced
          });
          setSuccess(`Sync complete: ${result.pulled.files_synced} pulled, ${result.pushed.files_synced} pushed`);
          setTimeout(() => {
            setSuccess(null);
            setSyncResult(null);
          }, 5000);
          syncSucceeded = true;
          break;
        } catch (teamErr) {
          // This team may not have sync configs, try next
          continue;
        }
      }

      if (!syncSucceeded) {
        setError('No sync configuration found. Configure sync first.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncingRepoId(null);
    }
  };

  // Sync configuration handlers
  const handleOpenSyncConfig = async (repo: GitHubRepository) => {
    setRepoToConfigureSync(repo);
    setSelectedTeamIdForSync(null);
    setFolderSyncConfigs([]);
  };

  const handleTeamSelectForSync = (teamId: string) => {
    if (!repoToConfigureSync) return;
    setSelectedTeamIdForSync(teamId);
    setIsLoadingSyncConfigs(true);
    // Reset folder configs - they will be populated by the effect when useDocuments loads
    setFolderSyncConfigs([]);
  };

  // Effect to initialize folder configs when team changes and folders are loaded
  useEffect(() => {
    const initializeFolderConfigs = async () => {
      if (!selectedTeamIdForSync || !repoToConfigureSync) {
        setIsLoadingSyncConfigs(false);
        return;
      }

      // Wait for useDocuments to finish loading
      if (isLoadingTeamFolders) {
        setIsLoadingSyncConfigs(true);
        return;
      }

      // Now loading is complete, check if there are folders
      if (teamFolders.length === 0) {
        // Team genuinely has no folders
        setFolderSyncConfigs([]);
        setIsLoadingSyncConfigs(false);
        return;
      }

      try {
        const existingConfigs = await teamsApi.getSyncConfigs(selectedTeamIdForSync, repoToConfigureSync.id);

        const configs = teamFolders.map(folder => {
          const existing = existingConfigs.find(c => c.folder_id === folder.id);
          return {
            folderId: folder.id,
            folderName: folder.name,
            selected: !!existing,
            githubPath: existing?.github_path || '',
          };
        });

        setFolderSyncConfigs(configs);
      } catch (err) {
        console.error('Failed to initialize folder configs:', err);
        // On error, still show the folders but without existing sync config
        setFolderSyncConfigs(teamFolders.map(folder => ({
          folderId: folder.id,
          folderName: folder.name,
          selected: false,
          githubPath: '',
        })));
      } finally {
        setIsLoadingSyncConfigs(false);
      }
    };

    initializeFolderConfigs();
  }, [selectedTeamIdForSync, teamFolders, repoToConfigureSync, isLoadingTeamFolders]);

  const toggleFolderSelection = (folderId: string) => {
    setFolderSyncConfigs(prev => prev.map(f =>
      f.folderId === folderId ? { ...f, selected: !f.selected } : f
    ));
  };

  const toggleAllFolders = () => {
    const allSelected = folderSyncConfigs.every(f => f.selected);
    setFolderSyncConfigs(prev => prev.map(f => ({ ...f, selected: !allSelected })));
  };

  const updateFolderGitHubPath = (folderId: string, path: string) => {
    setFolderSyncConfigs(prev => prev.map(f =>
      f.folderId === folderId ? { ...f, githubPath: path } : f
    ));
  };

  const handleSaveSync = async () => {
    if (!repoToConfigureSync || !selectedTeamIdForSync) return;

    const selectedFolders = folderSyncConfigs.filter(f => f.selected);
    if (selectedFolders.length === 0) {
      setError('Please select at least one folder to sync');
      return;
    }

    setIsConfiguringSync(true);
    try {
      const folderConfigs: CreateRepoSyncConfig[] = selectedFolders.map(folder => ({
        folder_id: folder.folderId,
        github_path: folder.githubPath.trim() || null,
      }));

      await teamsApi.configureMultiFolderSync(selectedTeamIdForSync, repoToConfigureSync.id, {
        folder_configs: folderConfigs,
      });

      setRepoToConfigureSync(null);
      setSelectedTeamIdForSync(null);
      setFolderSyncConfigs([]);
      setSuccess('Sync configuration saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to configure sync');
    } finally {
      setIsConfiguringSync(false);
    }
  };

  if (!isLoaded || loadingGitHubConnection) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">{t('settings.loadingOrganizations')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <AlertDescription className="font-medium">{success}</AlertDescription>
        </Alert>
      )}

      {/* Linked Repositories Card - Only visible when GitHub is connected */}
      {githubConnection && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                <div>
                  <CardTitle>Linked Repositories</CardTitle>
                  <CardDescription>
                    Manage repositories linked to your workspace for document sync
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchGitHubConnection()}
                disabled={loadingGitHubConnection}
              >
                <RefreshCw className={`h-4 w-4 ${loadingGitHubConnection ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Connected as @{githubConnection.github_username}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetchAvailableRepos();
                  setShowLinkRepoDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Link Repository
              </Button>
            </div>

            {githubConnection.repositories.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
                No repositories linked yet
              </div>
            ) : (
              <div className="space-y-2">
                {githubConnection.repositories.map((repo) => (
                  <div
                    key={repo.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      {repo.is_private ? (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{repo.repo_full_name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {repo.default_branch}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenSyncConfig(repo)}
                        title="Configure sync for teams"
                      >
                        <FolderSync className="h-4 w-4 mr-1" />
                        Configure Sync
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleSyncRepo(repo.id)}
                        disabled={syncingRepoId === repo.id}
                        title="Sync documents with GitHub (pull + push)"
                      >
                        {syncingRepoId === repo.id ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Syncing...
                          </>
                        ) : syncResult?.repoId === repo.id ? (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            <span className="text-xs">
                              ↓{syncResult.pulled} ↑{syncResult.pushed}
                            </span>
                          </>
                        ) : (
                          <>
                            <ArrowUpDown className="h-4 w-4 mr-1" />
                            Sync
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <a
                          href={repo.repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRepoToUnlink(repo.id)}
                      >
                        <Unlink className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}


      {/* Link Repository Dialog */}
      <Dialog open={showLinkRepoDialog} onOpenChange={(open) => {
        setShowLinkRepoDialog(open);
        if (!open) setRepoSearchQuery('');
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Repository</DialogTitle>
            <DialogDescription>
              Select a repository to link. Linked repositories can be used for document sync across all teams.
            </DialogDescription>
          </DialogHeader>
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search repositories..."
              value={repoSearchQuery}
              onChange={(e) => setRepoSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-[350px] overflow-y-auto space-y-2">
            {loadingAvailableRepos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading repositories...</span>
              </div>
            ) : availableRepos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No repositories available to link
              </div>
            ) : (
              (() => {
                const filteredRepos = availableRepos
                  .filter(
                    (repo) =>
                      !githubConnection?.repositories.some(
                        (linked) => linked.repo_full_name === repo.full_name
                      )
                  )
                  .filter(
                    (repo) =>
                      !repoSearchQuery ||
                      repo.full_name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
                      repo.description?.toLowerCase().includes(repoSearchQuery.toLowerCase())
                  );

                if (filteredRepos.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      No repositories match "{repoSearchQuery}"
                    </div>
                  );
                }

                return filteredRepos.map((repo) => (
                  <div
                    key={repo.full_name}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleLinkRepo(repo)}
                  >
                    <div className="flex items-center gap-2">
                      {repo.private ? (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{repo.full_name}</p>
                        {repo.description && (
                          <p className="text-sm text-muted-foreground truncate max-w-xs">
                            {repo.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Link className="h-4 w-4 text-muted-foreground" />
                  </div>
                ));
              })()
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLinkRepoDialog(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink Repository Dialog */}
      <Dialog open={!!repoToUnlink} onOpenChange={() => setRepoToUnlink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink Repository</DialogTitle>
            <DialogDescription>
              Are you sure you want to unlink this repository? Teams using this repository for sync will need to be reconfigured.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRepoToUnlink(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnlinkRepo}
              disabled={unlinkGitHubRepository.isPending}
            >
              {unlinkGitHubRepository.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Unlink
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Sync Dialog */}
      <Dialog
        open={!!repoToConfigureSync}
        onOpenChange={(open) => {
          if (!open) {
            setRepoToConfigureSync(null);
            setSelectedTeamIdForSync(null);
            setFolderSyncConfigs([]);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderSync className="h-5 w-5" />
              Configure Sync
            </DialogTitle>
            <DialogDescription>
              Select a team and configure which folders sync with{' '}
              <span className="font-medium">{repoToConfigureSync?.repo_full_name}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Team Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Select Team
              </Label>
              <Select
                value={selectedTeamIdForSync || ''}
                onValueChange={handleTeamSelectForSync}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Documents from this team's folders will sync with the repository
              </p>
            </div>

            {/* Folder Selection - only show when team is selected */}
            {selectedTeamIdForSync && (
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b pb-2">
                  <Label className="flex items-center gap-2">
                    <Folder className="h-4 w-4" />
                    Folders to Sync
                  </Label>
                  {folderSyncConfigs.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleAllFolders}
                      className="text-xs"
                    >
                      {folderSyncConfigs.every(f => f.selected) ? (
                        <>
                          <CheckSquare className="h-3 w-3 mr-1" />
                          Deselect All
                        </>
                      ) : (
                        <>
                          <Square className="h-3 w-3 mr-1" />
                          Select All
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {isLoadingSyncConfigs ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : folderSyncConfigs.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No folders in this team</p>
                    <p className="text-xs">Create folders in the team's Documents section first</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {folderSyncConfigs.map((config) => (
                      <div
                        key={config.folderId}
                        className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`sync-folder-${config.folderId}`}
                          checked={config.selected}
                          onCheckedChange={() => toggleFolderSelection(config.folderId)}
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-1">
                          <label
                            htmlFor={`sync-folder-${config.folderId}`}
                            className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                          >
                            <Folder className="h-4 w-4 text-muted-foreground" />
                            {config.folderName}
                          </label>
                          {config.selected && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">→ GitHub path:</span>
                              <Input
                                value={config.githubPath}
                                onChange={(e) => updateFolderGitHubPath(config.folderId, e.target.value)}
                                placeholder={config.folderName}
                                className="h-7 text-xs flex-1"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Leave GitHub path empty to use folder name as path
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRepoToConfigureSync(null);
                setSelectedTeamIdForSync(null);
                setFolderSyncConfigs([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSync}
              disabled={!selectedTeamIdForSync || !folderSyncConfigs.some(f => f.selected) || isConfiguringSync}
            >
              {isConfiguringSync ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <FolderSync className="h-4 w-4 mr-2" />
                  Save Sync Configuration
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
