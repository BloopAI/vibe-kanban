import { useState } from 'react';
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
import { Loader2, Plus, Key, Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nodesApi } from '@/lib/api';
import type { NodeApiKey } from '@/types/nodes';
import { formatDistanceToNow } from 'date-fns';

interface NodeApiKeySectionProps {
  organizationId: string;
  isAdmin: boolean;
}

export function NodeApiKeySection({
  organizationId,
  isAdmin,
}: NodeApiKeySectionProps) {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch API keys
  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ['nodeApiKeys', organizationId],
    queryFn: () => nodesApi.listApiKeys(organizationId),
    enabled: !!organizationId,
  });

  // Create API key mutation
  const createMutation = useMutation({
    mutationFn: (name: string) =>
      nodesApi.createApiKey({ organization_id: organizationId, name }),
    onSuccess: (response) => {
      setCreatedSecret(response.secret);
      setNewKeyName('');
      queryClient.invalidateQueries({ queryKey: ['nodeApiKeys', organizationId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    },
  });

  // Revoke API key mutation
  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => nodesApi.revokeApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodeApiKeys', organizationId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    },
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    setError(null);
    createMutation.mutate(newKeyName.trim());
  };

  const handleRevoke = (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Nodes using this key will no longer be able to connect.')) {
      return;
    }
    setError(null);
    revokeMutation.mutate(keyId);
  };

  const handleCopy = async () => {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  const handleCloseDialog = () => {
    setShowCreateDialog(false);
    setCreatedSecret(null);
    setNewKeyName('');
    setShowSecret(false);
  };

  const activeKeys = apiKeys.filter((key) => !key.revoked_at);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Node API Keys
            </CardTitle>
            <CardDescription>
              API keys allow nodes to authenticate with the hive server
            </CardDescription>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create API Key
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading API keys...</span>
          </div>
        ) : activeKeys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No API keys found. Create one to allow nodes to connect.
          </div>
        ) : (
          <div className="space-y-3">
            {activeKeys.map((key) => (
              <ApiKeyItem
                key={key.id}
                apiKey={key}
                onRevoke={handleRevoke}
                isRevoking={revokeMutation.isPending}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </CardContent>

      {/* Create API Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createdSecret ? 'API Key Created' : 'Create Node API Key'}
            </DialogTitle>
            <DialogDescription>
              {createdSecret
                ? 'Copy this secret now. You won\'t be able to see it again.'
                : 'Give your API key a name to identify which node it\'s used for.'}
            </DialogDescription>
          </DialogHeader>

          {createdSecret ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription className="font-mono text-sm break-all flex items-center gap-2">
                  {showSecret ? createdSecret : '••••••••••••••••••••••••'}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDescription>
              </Alert>
              <Button onClick={handleCopy} className="w-full">
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                Use this key as the <code className="bg-muted px-1 rounded">VK_NODE_API_KEY</code> environment variable on your node.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="key-name">Key Name</Label>
                <Input
                  id="key-name"
                  placeholder="e.g., MacBook Pro, Build Server"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newKeyName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Create
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface ApiKeyItemProps {
  apiKey: NodeApiKey;
  onRevoke: (keyId: string) => void;
  isRevoking: boolean;
  isAdmin: boolean;
}

function ApiKeyItem({ apiKey, onRevoke, isRevoking, isAdmin }: ApiKeyItemProps) {
  const createdAt = new Date(apiKey.created_at);
  const lastUsed = apiKey.last_used_at ? new Date(apiKey.last_used_at) : null;

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <Key className="h-5 w-5 text-muted-foreground" />
        <div>
          <div className="font-medium text-sm">{apiKey.name}</div>
          <div className="text-xs text-muted-foreground">
            <code>{apiKey.key_prefix}...</code>
            {' · '}
            Created {formatDistanceToNow(createdAt, { addSuffix: true })}
          </div>
          {lastUsed && (
            <div className="text-xs text-muted-foreground">
              Last used {formatDistanceToNow(lastUsed, { addSuffix: true })}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {apiKey.revoked_at ? (
          <Badge variant="destructive">Revoked</Badge>
        ) : (
          <>
            <Badge variant="outline">Active</Badge>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRevoke(apiKey.id)}
                disabled={isRevoking}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
