import { useState, useEffect } from 'react';
import { projectsApi, type GitRemote } from '@/lib/api';
import { Copy, ExternalLink, Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface GitRemotesListProps {
  projectId: string;
}

export function GitRemotesList({ projectId }: GitRemotesListProps) {
  const [remotes, setRemotes] = useState<GitRemote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingRemote, setEditingRemote] = useState<GitRemote | null>(null);
  const [deletingRemote, setDeletingRemote] = useState<GitRemote | null>(null);
  const [remoteName, setRemoteName] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadRemotes();
  }, [projectId]);

  const loadRemotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await projectsApi.getRemotes(projectId);
      setRemotes(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load remotes');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleAddRemote = () => {
    setRemoteName('');
    setRemoteUrl('');
    setIsAddDialogOpen(true);
  };

  const handleEditRemote = (remote: GitRemote) => {
    setRemoteName(remote.name);
    setRemoteUrl(remote.url);
    setEditingRemote(remote);
  };

  const handleDeleteRemote = (remote: GitRemote) => {
    setDeletingRemote(remote);
  };

  const handleSaveRemote = async () => {
    if (!remoteName.trim() || !remoteUrl.trim()) return;

    setSaving(true);
    setError(null);

    try {
      if (editingRemote) {
        // Update existing remote
        await projectsApi.updateRemote(projectId, editingRemote.name, remoteUrl);
      } else {
        // Add new remote
        await projectsApi.addRemote(projectId, remoteName, remoteUrl);
      }

      await loadRemotes();
      setIsAddDialogOpen(false);
      setEditingRemote(null);
      setRemoteName('');
      setRemoteUrl('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save remote'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRemote) return;

    setDeleting(true);
    setError(null);

    try {
      await projectsApi.deleteRemote(projectId, deletingRemote.name);
      await loadRemotes();
      setDeletingRemote(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete remote'
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleDialogClose = () => {
    if (!saving) {
      setIsAddDialogOpen(false);
      setEditingRemote(null);
      setRemoteName('');
      setRemoteUrl('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-5 w-5 border-2 border-muted-foreground border-t-transparent rounded-full"></div>
        <span className="ml-2 text-sm text-muted-foreground">
          Loading remotes...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {remotes.length === 0
              ? 'No git remotes configured'
              : `${remotes.length} remote${remotes.length !== 1 ? 's' : ''} configured`}
          </p>
          <Button
            onClick={handleAddRemote}
            size="sm"
            className="h-8"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Remote
          </Button>
        </div>

        {remotes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-xs text-muted-foreground">
              Configure a remote to enable pushing branches and creating pull
              requests
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {remotes.map((remote) => (
              <div
                key={remote.name}
                className="rounded-lg border p-3 bg-card hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-foreground">
                        {remote.name}
                      </h4>
                      {remote.name === 'origin' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded truncate max-w-full">
                        {remote.url}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={() => copyToClipboard(remote.url)}
                        title="Copy URL"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      {(remote.url.startsWith('http://') ||
                        remote.url.startsWith('https://')) && (
                        <a
                          href={remote.url.replace('.git', '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0"
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            title="Open in browser"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleEditRemote(remote)}
                      title="Edit remote"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteRemote(remote)}
                      title="Delete remote"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Remote Dialog */}
      <Dialog
        open={isAddDialogOpen || editingRemote !== null}
        onOpenChange={handleDialogClose}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRemote ? 'Edit Remote' : 'Add Remote'}
            </DialogTitle>
            <DialogDescription>
              {editingRemote
                ? 'Update the URL for this git remote'
                : 'Add a new git remote to this project'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="remote-name">Remote Name</Label>
              <Input
                id="remote-name"
                value={remoteName}
                onChange={(e) => setRemoteName(e.target.value)}
                placeholder="origin"
                disabled={!!editingRemote}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="remote-url">Remote URL</Label>
              <Input
                id="remote-url"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="https://github.com/username/repo.git"
              />
              <p className="text-xs text-muted-foreground">
                Example: https://github.com/username/repo.git or
                git@github.com:username/repo.git
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleDialogClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRemote}
              disabled={saving || !remoteName.trim() || !remoteUrl.trim()}
            >
              {saving ? 'Saving...' : editingRemote ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deletingRemote !== null}
        onOpenChange={(open) => !open && !deleting && setDeletingRemote(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Remote</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the remote "
              {deletingRemote?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingRemote(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={deleting}
              variant="destructive"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
