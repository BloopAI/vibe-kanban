import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Github,
  Loader2,
  AlertCircle,
  Link,
  Unlink,
  Trash2,
  ExternalLink,
  Lock,
  Globe,
  Plus,
  ArrowUpFromLine,
  ArrowDownToLine,
  FolderSync,
  Settings,
  Check,
  Folder,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useGitHubConnection } from '@/hooks/useGitHubConnection';
import { useTeams } from '@/hooks/useTeams';
import { useDocuments } from '@/hooks/useDocuments';
import { format } from 'date-fns';
import type { GitHubRepoInfo, GitHubRepository } from 'shared/types';

export default function TeamGitHub() {
  const { teamId } = useParams<{ teamId: string }>();
  const { teamsById } = useTeams();
  const team = teamId ? teamsById[teamId] : null;

  const {
    connection,
    repositories,
    availableRepos,
    isLoading,
    isLoadingAvailableRepos,
    error,
    fetchAvailableRepos,
    connectWithOAuth,
    deleteConnection,
    linkRepository,
    unlinkRepository,
    configureSync,
    clearSync,
    pushDocuments,
    pullDocuments,
  } = useGitHubConnection(teamId || '');

  const { folders } = useDocuments(teamId || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [repoToUnlink, setRepoToUnlink] = useState<string | null>(null);

  // Link repo state
  const [showLinkRepoDialog, setShowLinkRepoDialog] = useState(false);
  const [selectedRepoToLink, setSelectedRepoToLink] = useState<GitHubRepoInfo | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  // Sync config state
  const [repoToConfigureSync, setRepoToConfigureSync] = useState<GitHubRepository | null>(null);
  const [syncPath, setSyncPath] = useState('docs');
  const [syncFolderId, setSyncFolderId] = useState('');
  const [isConfiguringSync, setIsConfiguringSync] = useState(false);

  // Push/Pull state
  const [syncingRepoId, setSyncingRepoId] = useState<string | null>(null);
  const [syncOperation, setSyncOperation] = useState<'push' | 'pull' | null>(null);
  const [syncResult, setSyncResult] = useState<{ message: string; filesCount: number } | null>(null);

  const handleOAuthConnect = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await connectWithOAuth();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to start OAuth flow'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsSubmitting(true);
    try {
      await deleteConnection();
      setShowDisconnectDialog(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to disconnect GitHub'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlinkRepo = async () => {
    if (!repoToUnlink) return;
    try {
      await unlinkRepository(repoToUnlink);
      setRepoToUnlink(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to unlink repository'
      );
    }
  };

  const handleOpenLinkDialog = async () => {
    setShowLinkRepoDialog(true);
    setSelectedRepoToLink(null);
    await fetchAvailableRepos();
  };

  const handleLinkRepo = async () => {
    if (!selectedRepoToLink) return;
    setIsLinking(true);
    try {
      await linkRepository({
        repo_full_name: selectedRepoToLink.full_name,
        repo_name: selectedRepoToLink.name,
        repo_owner: selectedRepoToLink.full_name.split('/')[0],
        repo_url: selectedRepoToLink.html_url,
        default_branch: selectedRepoToLink.default_branch ?? 'main',
        is_private: selectedRepoToLink.private,
      });
      setShowLinkRepoDialog(false);
      setSelectedRepoToLink(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to link repository'
      );
    } finally {
      setIsLinking(false);
    }
  };

  const handleOpenSyncConfig = (repo: GitHubRepository) => {
    setRepoToConfigureSync(repo);
    setSyncPath(repo.sync_path || 'docs');
    setSyncFolderId(repo.sync_folder_id || '');
  };

  const handleConfigureSync = async () => {
    if (!repoToConfigureSync || !syncFolderId) return;
    setIsConfiguringSync(true);
    try {
      await configureSync(repoToConfigureSync.id, {
        sync_path: syncPath,
        sync_folder_id: syncFolderId,
      });
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
      await clearSync(repoId);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to clear sync configuration'
      );
    }
  };

  const handlePush = async (repoId: string) => {
    setSyncingRepoId(repoId);
    setSyncOperation('push');
    setSyncResult(null);
    try {
      const result = await pushDocuments(repoId);
      setSyncResult({
        message: result.message || 'Documents pushed successfully',
        filesCount: result.files_synced,
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to push documents'
      );
    } finally {
      setSyncingRepoId(null);
      setSyncOperation(null);
    }
  };

  const handlePull = async (repoId: string) => {
    setSyncingRepoId(repoId);
    setSyncOperation('pull');
    setSyncResult(null);
    try {
      const result = await pullDocuments(repoId);
      setSyncResult({
        message: result.message || 'Documents pulled successfully',
        filesCount: result.files_synced,
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to pull documents'
      );
    } finally {
      setSyncingRepoId(null);
      setSyncOperation(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Github className="h-8 w-8" />
        <div>
          <h1 className="text-2xl font-semibold">GitHub Integration</h1>
          <p className="text-sm text-muted-foreground">
            Connect GitHub to {team?.name || 'this team'} using a Personal Access Token
          </p>
        </div>
      </div>

      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Connection Status
          </CardTitle>
          <CardDescription>
            {connection
              ? 'Your GitHub account is connected'
              : 'Connect your GitHub account to link repositories'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connection ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Github className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {connection.github_username || 'GitHub Connected'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Connected {format(new Date(connection.connected_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Connected
                </Badge>
              </div>

              {/* Reconnect Section */}
              <div className="border-t pt-4 space-y-3">
                <Label>Reconnect GitHub</Label>
                <p className="text-sm text-muted-foreground">
                  If you need to refresh your connection or change accounts, reconnect below.
                </p>
                <Button
                  variant="outline"
                  onClick={handleOAuthConnect}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Reconnecting...
                    </>
                  ) : (
                    <>
                      <Github className="h-4 w-4 mr-2" />
                      Reconnect with GitHub
                    </>
                  )}
                </Button>
              </div>

              {/* Disconnect Button */}
              <div className="border-t pt-4">
                <Button
                  variant="destructive"
                  onClick={() => setShowDisconnectDialog(true)}
                >
                  <Unlink className="h-4 w-4 mr-2" />
                  Disconnect GitHub
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Click the button below to authorize this app with your GitHub account.
                This will allow us to access your repositories.
              </p>

              <Button onClick={handleOAuthConnect} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Github className="h-4 w-4 mr-2" />
                    Connect with GitHub
                  </>
                )}
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
            {syncResult.message} ({syncResult.filesCount} files)
          </AlertDescription>
        </Alert>
      )}

      {/* Linked Repositories */}
      {connection && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                Linked Repositories
              </CardTitle>
              <CardDescription>
                Repositories linked to this team ({repositories.length})
              </CardDescription>
            </div>
            <Button onClick={handleOpenLinkDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Link Repository
            </Button>
          </CardHeader>
          <CardContent>
            {repositories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Github className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No repositories linked yet</p>
                <p className="text-sm">
                  Click "Link Repository" to connect a GitHub repository
                </p>
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Repository</TableHeaderCell>
                    <TableHeaderCell>Visibility</TableHeaderCell>
                    <TableHeaderCell>Sync Status</TableHeaderCell>
                    <TableHeaderCell>Last Synced</TableHeaderCell>
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
                        <TableCell className="text-muted-foreground">
                          {repo.last_synced_at
                            ? format(new Date(repo.last_synced_at), 'MMM d, yyyy h:mm a')
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {hasSyncConfig ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePush(repo.id)}
                                  disabled={isSyncing}
                                  title="Push documents to GitHub"
                                >
                                  {isSyncing && syncOperation === 'push' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <ArrowUpFromLine className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePull(repo.id)}
                                  disabled={isSyncing}
                                  title="Pull documents from GitHub"
                                >
                                  {isSyncing && syncOperation === 'pull' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <ArrowDownToLine className="h-4 w-4" />
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRepoToUnlink(repo.id)}
                              title="Unlink repository"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect GitHub?</DialogTitle>
            <DialogDescription>
              This will remove the GitHub connection and all linked repositories
              for this team. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDisconnectDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Disconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink Repository Confirmation Dialog */}
      <Dialog open={!!repoToUnlink} onOpenChange={() => setRepoToUnlink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink Repository?</DialogTitle>
            <DialogDescription>
              This will remove the repository link from this team. You can
              re-link it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepoToUnlink(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleUnlinkRepo}>
              Unlink
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Repository Dialog */}
      <Dialog open={showLinkRepoDialog} onOpenChange={setShowLinkRepoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link GitHub Repository</DialogTitle>
            <DialogDescription>
              Select a repository from your GitHub account to link to this team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {isLoadingAvailableRepos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : availableRepos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Github className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No repositories available</p>
                <p className="text-sm">Make sure your GitHub account has repositories</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Repository</Label>
                <Select
                  value={selectedRepoToLink?.full_name || ''}
                  onValueChange={(value) => {
                    const repo = availableRepos.find(r => r.full_name === value);
                    setSelectedRepoToLink(repo || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a repository" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRepos.map((repo) => (
                      <SelectItem key={repo.id} value={repo.full_name}>
                        <div className="flex items-center gap-2">
                          {repo.private ? (
                            <Lock className="h-3 w-3" />
                          ) : (
                            <Globe className="h-3 w-3" />
                          )}
                          {repo.full_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedRepoToLink?.description && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {selectedRepoToLink.description}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLinkRepoDialog(false)}
              disabled={isLinking}
            >
              Cancel
            </Button>
            <Button
              onClick={handleLinkRepo}
              disabled={!selectedRepoToLink || isLinking}
            >
              {isLinking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <Link className="h-4 w-4 mr-2" />
                  Link Repository
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Sync Dialog */}
      <Dialog open={!!repoToConfigureSync} onOpenChange={() => setRepoToConfigureSync(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Document Sync</DialogTitle>
            <DialogDescription>
              Set up synchronization between a team folder and the GitHub repository.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Team Folder</Label>
              <Select value={syncFolderId} onValueChange={setSyncFolderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a folder to sync" />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      <div className="flex items-center gap-2">
                        <Folder className="h-3 w-3" />
                        {folder.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Documents from this folder will be synced to GitHub
              </p>
            </div>
            <div className="space-y-2">
              <Label>GitHub Path</Label>
              <Input
                value={syncPath}
                onChange={(e) => setSyncPath(e.target.value)}
                placeholder="docs"
              />
              <p className="text-xs text-muted-foreground">
                Path in the repository where documents will be stored (e.g., "docs" or "content/articles")
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {repoToConfigureSync?.sync_folder_id && (
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
                disabled={!syncFolderId || isConfiguringSync}
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
