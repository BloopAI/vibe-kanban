import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Trash2,
  LogIn,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  claudeAccountsApi,
  type ClaudeAccountWithStatus,
  type ClaudeAccountsResponse,
} from '@/lib/api';

export function ClaudeAccountsSettings() {
  const queryClient = useQueryClient();

  // State
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Query to fetch accounts
  const {
    data: accountsData,
    isLoading,
    error,
    refetch,
  } = useQuery<ClaudeAccountsResponse>({
    queryKey: ['claude-accounts'],
    queryFn: claudeAccountsApi.list,
    refetchInterval: 5000, // Poll every 5 seconds to update login status
  });

  // Mutations
  const addAccountMutation = useMutation({
    mutationFn: (name: string) => claudeAccountsApi.add(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claude-accounts'] });
      setAddDialogOpen(false);
      setNewAccountName('');
      showSuccess('Account created. Click "Login" to authenticate.');
    },
    onError: (err: Error) => {
      showError(err.message);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (id: string) => claudeAccountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claude-accounts'] });
      setDeleteConfirmId(null);
      showSuccess('Account deleted.');
    },
    onError: (err: Error) => {
      showError(err.message);
    },
  });

  const loginMutation = useMutation({
    mutationFn: (id: string) => claudeAccountsApi.login(id),
    onSuccess: (message) => {
      showSuccess(message);
    },
    onError: (err: Error) => {
      showError(err.message);
    },
  });

  const updateRotationMutation = useMutation({
    mutationFn: (enabled: boolean) => claudeAccountsApi.updateRotation(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claude-accounts'] });
      showSuccess('Rotation setting updated.');
    },
    onError: (err: Error) => {
      showError(err.message);
    },
  });

  // Helper functions
  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const showError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage(null);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isRateLimited = (account: ClaudeAccountWithStatus) => {
    if (!account.rate_limited_until) return false;
    return account.rate_limited_until > Date.now() / 1000;
  };

  // Clear messages on unmount
  useEffect(() => {
    return () => {
      setSuccessMessage(null);
      setErrorMessage(null);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading Claude accounts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load Claude accounts: {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  const accounts = accountsData?.accounts || [];
  const rotationEnabled = accountsData?.rotation_enabled || false;

  return (
    <div className="space-y-6">
      {successMessage && (
        <Alert variant="success">
          <AlertDescription className="font-medium">{successMessage}</AlertDescription>
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Claude Accounts</CardTitle>
          <CardDescription>
            Manage multiple Claude accounts for automatic rotation when rate limits are hit.
            Each account requires a separate Claude Pro/Max subscription.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Rotation Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="rotation-toggle" className="text-base">
                Enable Account Rotation
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically switch to the next account when rate limits are hit.
                Also enable "Use Account Rotation" in your Claude Code agent configuration.
              </p>
            </div>
            <Switch
              id="rotation-toggle"
              checked={rotationEnabled}
              onCheckedChange={(checked) => updateRotationMutation.mutate(checked)}
              disabled={updateRotationMutation.isPending || accounts.length < 2}
            />
          </div>

          {accounts.length < 2 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Add at least 2 accounts to enable rotation.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Accounts List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Accounts ({accounts.length})</CardTitle>
            <CardDescription>Your configured Claude accounts</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No accounts configured yet.</p>
              <p className="text-sm mt-2">
                Click "Add Account" to add your first Claude account.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{account.name}</span>
                      {account.is_logged_in ? (
                        <Badge className="gap-1 bg-green-600 text-white border-green-600">
                          <CheckCircle className="h-3 w-3" />
                          Logged In
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Not Logged In
                        </Badge>
                      )}
                      {isRateLimited(account) && (
                        <Badge className="gap-1 bg-yellow-600 text-white border-yellow-600">
                          <AlertCircle className="h-3 w-3" />
                          Rate Limited
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Created {formatDate(account.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loginMutation.mutate(account.id)}
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogIn className="h-4 w-4 mr-1" />
                      )}
                      Login
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteConfirmId(account.id)}
                      disabled={deleteAccountMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Account Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Claude Account</DialogTitle>
            <DialogDescription>
              Give this account a name to identify it. After adding, click "Login" to authenticate
              with your Claude credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="account-name">Account Name</Label>
              <Input
                id="account-name"
                placeholder="e.g., Personal, Work, Backup"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAccountName.trim()) {
                    addAccountMutation.mutate(newAccountName.trim());
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addAccountMutation.mutate(newAccountName.trim())}
              disabled={!newAccountName.trim() || addAccountMutation.isPending}
            >
              {addAccountMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this account? This will remove the account
              credentials and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteAccountMutation.mutate(deleteConfirmId)}
              disabled={deleteAccountMutation.isPending}
            >
              {deleteAccountMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
