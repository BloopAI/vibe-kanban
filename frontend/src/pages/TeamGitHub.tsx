import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Github,
  Loader2,
  AlertCircle,
  Link,
  Unlink,
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
  Lock,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useGitHubConnection } from '@/hooks/useGitHubConnection';
import { useTeams } from '@/hooks/useTeams';
import { format } from 'date-fns';

export default function TeamGitHub() {
  const { teamId } = useParams<{ teamId: string }>();
  const { teamsById } = useTeams();
  const team = teamId ? teamsById[teamId] : null;

  const {
    connection,
    repositories,
    isLoading,
    error,
    createConnection,
    updateConnection,
    deleteConnection,
    unlinkRepository,
  } = useGitHubConnection(teamId || '');

  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [repoToUnlink, setRepoToUnlink] = useState<string | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createConnection({ access_token: token.trim() });
      setToken('');
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to connect GitHub'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateToken = async () => {
    if (!token.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await updateConnection({ access_token: token.trim(), github_username: null });
      setToken('');
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to update token'
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

              {/* Update Token Section */}
              <div className="border-t pt-4 space-y-3">
                <Label>Update Personal Access Token</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showToken ? 'text' : 'password'}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <Button
                    onClick={handleUpdateToken}
                    disabled={!token.trim() || isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Update'
                    )}
                  </Button>
                </div>
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
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token">Personal Access Token</Label>
                <div className="relative">
                  <Input
                    id="token"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Generate a token at{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    GitHub Settings &rarr; Developer settings &rarr; Personal access tokens
                  </a>
                </p>
              </div>

              <Button type="submit" disabled={isSubmitting || !token.trim()}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Github className="h-4 w-4 mr-2" />
                    Connect GitHub
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Linked Repositories */}
      {connection && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              Linked Repositories
            </CardTitle>
            <CardDescription>
              Repositories linked to this team ({repositories.length})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {repositories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Github className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No repositories linked yet</p>
                <p className="text-sm">
                  Repositories will appear here when linked to projects
                </p>
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Repository</TableHeaderCell>
                    <TableHeaderCell>Branch</TableHeaderCell>
                    <TableHeaderCell>Visibility</TableHeaderCell>
                    <TableHeaderCell>Linked</TableHeaderCell>
                    <TableHeaderCell className="w-[100px]">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {repositories.map((repo) => (
                    <TableRow key={repo.id}>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {repo.default_branch || 'main'}
                        </Badge>
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
                      <TableCell className="text-muted-foreground">
                        {format(new Date(repo.linked_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRepoToUnlink(repo.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
    </div>
  );
}
