import { useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Github,
  Loader2,
  AlertCircle,
  ExternalLink,
  Lock,
  Globe,
  RefreshCw,
  FolderSync,
  Settings,
  Check,
  Folder,
  CheckSquare,
  Square,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useWorkspaceGitHubConnection } from '@/hooks/useWorkspaceGitHub';
import { useGitHubConnection } from '@/hooks/useGitHubConnection';
import { useTeams } from '@/hooks/useTeams';
import { useDocuments } from '@/hooks/useDocuments';
import { format } from 'date-fns';
import type { GitHubRepository, CreateRepoSyncConfig } from 'shared/types';

interface FolderSyncConfig {
  folderId: string;
  folderName: string;
  selected: boolean;
  githubPath: string;
}

export default function TeamGitHub() {
  const { teamId } = useParams<{ teamId: string }>();
  const { teamsById } = useTeams();
  const team = teamId ? teamsById[teamId] : null;

  // Use workspace-level GitHub connection
  const {
    data: workspaceConnection,
    isLoading: isLoadingWorkspaceConnection,
  } = useWorkspaceGitHubConnection();

  // Use team-level sync operations (these don't require team connection anymore)
  const {
    pushDocuments,
    pullDocuments,
    getSyncConfigs,
    configureMultiFolderSync,
    clearMultiFolderSync,
  } = useGitHubConnection(teamId || '');

  const { folders } = useDocuments(teamId || '');

  const [submitError, setSubmitError] = useState<string | null>(null);

  // Sync config state (multi-folder)
  const [repoToConfigureSync, setRepoToConfigureSync] = useState<GitHubRepository | null>(null);
  const [folderSyncConfigs, setFolderSyncConfigs] = useState<FolderSyncConfig[]>([]);
  const [isConfiguringSync, setIsConfiguringSync] = useState(false);
  const [isLoadingSyncConfigs, setIsLoadingSyncConfigs] = useState(false);

  // Sync state
  const [syncingRepoId, setSyncingRepoId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ message: string; pushedCount: number; pulledCount: number } | null>(null);

  const handleOpenSyncConfig = async (repo: GitHubRepository) => {
    setRepoToConfigureSync(repo);
    setIsLoadingSyncConfigs(true);

    try {
      // Load existing sync configs
      const existingConfigs = await getSyncConfigs(repo.id);

      // Initialize folder configs for all folders
      const configs: FolderSyncConfig[] = folders.map(folder => {
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
      console.error('Failed to load sync configs:', err);
      // Initialize with empty configs
      setFolderSyncConfigs(folders.map(folder => ({
        folderId: folder.id,
        folderName: folder.name,
        selected: false,
        githubPath: '',
      })));
    } finally {
      setIsLoadingSyncConfigs(false);
    }
  };

  const handleConfigureSync = async () => {
    if (!repoToConfigureSync) return;

    const selectedFolders = folderSyncConfigs.filter(f => f.selected);
    if (selectedFolders.length === 0) {
      setSubmitError('Please select at least one folder to sync');
      return;
    }

    setIsConfiguringSync(true);
    try {
      // Build folder configs - use folder name as github_path if not specified
      const folderConfigs: CreateRepoSyncConfig[] = selectedFolders.map(folder => ({
        folder_id: folder.folderId,
        github_path: folder.githubPath.trim() || null, // If empty, backend will use folder name
      }));

      await configureMultiFolderSync(repoToConfigureSync.id, { folder_configs: folderConfigs });
      setRepoToConfigureSync(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to configure sync'
      );
    } finally {
      setIsConfiguringSync(false);
    }
  };

  const handleClearSync = async (repoId: string) => {
    try {
      await clearMultiFolderSync(repoId);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to clear sync configuration'
      );
    }
  };

  // Helper to toggle folder selection
  const toggleFolderSelection = (folderId: string) => {
    setFolderSyncConfigs(prev => prev.map(f =>
      f.folderId === folderId ? { ...f, selected: !f.selected } : f
    ));
  };

  // Helper to toggle all folders
  const toggleAllFolders = () => {
    const allSelected = folderSyncConfigs.every(f => f.selected);
    setFolderSyncConfigs(prev => prev.map(f => ({ ...f, selected: !allSelected })));
  };

  // Helper to update folder's github path
  const updateFolderGitHubPath = (folderId: string, path: string) => {
    setFolderSyncConfigs(prev => prev.map(f =>
      f.folderId === folderId ? { ...f, githubPath: path } : f
    ));
  };

  const handleSync = async (repoId: string) => {
    setSyncingRepoId(repoId);
    setSyncResult(null);
    setSubmitError(null);

    let pushedCount = 0;
    let pulledCount = 0;

    try {
      // First pull from GitHub to get any remote changes
      const pullResult = await pullDocuments(repoId);
      pulledCount = pullResult.files_synced;

      // Then push local changes to GitHub
      const pushResult = await pushDocuments(repoId);
      pushedCount = pushResult.files_synced;

      setSyncResult({
        message: 'Sync completed successfully',
        pushedCount,
        pulledCount,
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to sync documents'
      );
    } finally {
      setSyncingRepoId(null);
    }
  };

  if (isLoadingWorkspaceConnection) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Get repositories from workspace connection
  const repositories = workspaceConnection?.repositories || [];

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Github className="h-8 w-8" />
        <div>
          <h1 className="text-2xl font-semibold">GitHub Integration</h1>
          <p className="text-sm text-muted-foreground">
            Sync documents from {team?.name || 'this team'} with GitHub repositories
          </p>
        </div>
      </div>

      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Workspace Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Workspace GitHub Connection
          </CardTitle>
          <CardDescription>
            GitHub is connected at the workspace level and shared across all teams
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workspaceConnection ? (
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Github className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium">
                    @{workspaceConnection.github_username || 'GitHub Connected'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Connected {format(new Date(workspaceConnection.connected_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Connected
              </Badge>
            </div>
          ) : (
            <div className="text-center py-6">
              <Github className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-2">GitHub Not Connected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Connect GitHub in Organization Settings to enable document sync
              </p>
              <Button asChild>
                <RouterLink to="/settings/organization">
                  <Settings className="h-4 w-4 mr-2" />
                  Go to Organization Settings
                  <ArrowRight className="h-4 w-4 ml-2" />
                </RouterLink>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Result Alert */}
      {syncResult && (
        <Alert className="bg-green-50 border-green-200">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            {syncResult.message} - Pulled {syncResult.pulledCount} files, Pushed {syncResult.pushedCount} files
          </AlertDescription>
        </Alert>
      )}

      {/* Available Repositories for Sync */}
      {workspaceConnection && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderSync className="h-5 w-5" />
                Document Sync
              </CardTitle>
              <CardDescription>
                Configure which repositories sync with this team's document folders ({repositories.length} available)
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {repositories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Github className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No repositories linked yet</p>
                <p className="text-sm">
                  Link repositories in Organization Settings to enable sync
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <RouterLink to="/settings/organization">
                    Go to Organization Settings
                  </RouterLink>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Repository</TableHeaderCell>
                    <TableHeaderCell>Visibility</TableHeaderCell>
                    <TableHeaderCell>Sync Status</TableHeaderCell>
                    <TableHeaderCell className="w-[200px]">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {repositories.map((repo) => {
                    const isSyncing = syncingRepoId === repo.id;
                    const hasSyncConfig = !!repo.sync_folder_id;
                    const syncFolder = folders.find(f => f.id === repo.sync_folder_id);

                    return (
                      <TableRow key={repo.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <Github className="h-4 w-4 text-muted-foreground" />
                              <a
                                href={repo.repo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium hover:text-primary hover:underline flex items-center gap-1"
                              >
                                {repo.repo_full_name}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Branch: {repo.default_branch || 'main'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {repo.is_private ? (
                            <Badge variant="secondary" className="gap-1">
                              <Lock className="h-3 w-3" />
                              Private
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Globe className="h-3 w-3" />
                              Public
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasSyncConfig ? (
                            <div className="flex flex-col gap-1">
                              <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-800">
                                <FolderSync className="h-3 w-3" />
                                Configured
                              </Badge>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Folder className="h-3 w-3" />
                                {syncFolder?.name || 'Unknown folder'}
                                <span className="text-muted-foreground/60">→</span>
                                /{repo.sync_path}
                              </div>
                            </div>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Settings className="h-3 w-3" />
                              Not configured
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {hasSyncConfig ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSync(repo.id)}
                                  disabled={isSyncing}
                                  title="Sync documents with GitHub"
                                >
                                  {isSyncing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenSyncConfig(repo)}
                                  title="Configure sync"
                                >
                                  <Settings className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenSyncConfig(repo)}
                              >
                                <FolderSync className="h-4 w-4 mr-1" />
                                Setup Sync
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configure Sync Dialog - Multi-folder */}
      <Dialog open={!!repoToConfigureSync} onOpenChange={() => setRepoToConfigureSync(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Document Sync</DialogTitle>
            <DialogDescription>
              Select folders to sync with the GitHub repository. Leave GitHub Path empty to use the folder name.
            </DialogDescription>
          </DialogHeader>
          {isLoadingSyncConfigs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {/* Select All */}
              <div className="flex items-center justify-between border-b pb-2">
                <Label className="font-medium">Folders to Sync</Label>
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
              </div>

              {/* Folder list with checkboxes */}
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {folderSyncConfigs.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No folders available</p>
                    <p className="text-xs">Create folders in the Documents section first</p>
                  </div>
                ) : (
                  folderSyncConfigs.map((config) => (
                    <div key={config.folderId} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                      <Checkbox
                        id={`folder-${config.folderId}`}
                        checked={config.selected}
                        onCheckedChange={() => toggleFolderSelection(config.folderId)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-1">
                        <label
                          htmlFor={`folder-${config.folderId}`}
                          className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                        >
                          <Folder className="h-4 w-4 text-muted-foreground" />
                          {config.folderName}
                        </label>
                        {config.selected && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">→</span>
                            <Input
                              value={config.githubPath}
                              onChange={(e) => updateFolderGitHubPath(config.folderId, e.target.value)}
                              placeholder={config.folderName}
                              className="h-7 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                If GitHub Path is empty, the folder name will be used. Documents sync to: <code>repo/{'{path}'}</code>
              </p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {folderSyncConfigs.some(f => f.selected) && (
              <Button
                variant="outline"
                onClick={() => {
                  if (repoToConfigureSync) {
                    handleClearSync(repoToConfigureSync.id);
                    setRepoToConfigureSync(null);
                  }
                }}
                className="text-destructive hover:text-destructive"
              >
                Clear Sync Config
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                onClick={() => setRepoToConfigureSync(null)}
                disabled={isConfiguringSync}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfigureSync}
                disabled={!folderSyncConfigs.some(f => f.selected) || isConfiguringSync}
              >
                {isConfiguringSync ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <FolderSync className="h-4 w-4 mr-2" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
