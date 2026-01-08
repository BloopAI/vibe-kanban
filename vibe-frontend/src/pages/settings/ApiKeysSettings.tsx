import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, Key, Loader2, Plus, Trash2, AlertTriangle, Check, Eye, EyeOff } from 'lucide-react';
import { apiKeysApi, ApiKeyInfo, ApiKeyWithSecret } from '@/lib/api';

export function ApiKeysSettings() {
  const { t } = useTranslation('settings');
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create key dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);

  // Newly created key dialog state
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<ApiKeyWithSecret | null>(null);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(true);

  // Delete confirmation state
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load API keys
  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      setError(null);
      const keys = await apiKeysApi.list();
      setApiKeys(keys);
    } catch (err) {
      setError(t('settings.apiKeys.errors.loadFailed'));
      console.error('Failed to load API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;

    try {
      setCreating(true);
      setError(null);
      const key = await apiKeysApi.create({ name: newKeyName.trim() });
      setNewlyCreatedKey(key);
      setShowCreateDialog(false);
      setNewKeyName('');
      await loadApiKeys();
    } catch (err) {
      setError(t('settings.apiKeys.errors.createFailed'));
      console.error('Failed to create API key:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      setDeleting(true);
      setError(null);
      await apiKeysApi.revoke(keyId);
      setSuccess(t('settings.apiKeys.revokeSuccess'));
      setTimeout(() => setSuccess(null), 3000);
      await loadApiKeys();
    } catch (err) {
      setError(t('settings.apiKeys.errors.revokeFailed'));
      console.error('Failed to revoke API key:', err);
    } finally {
      setDeleting(false);
      setKeyToDelete(null);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      setDeleting(true);
      setError(null);
      await apiKeysApi.delete(keyId);
      setSuccess(t('settings.apiKeys.deleteSuccess'));
      setTimeout(() => setSuccess(null), 3000);
      await loadApiKeys();
    } catch (err) {
      setError(t('settings.apiKeys.errors.deleteFailed'));
      console.error('Failed to delete API key:', err);
    } finally {
      setDeleting(false);
      setKeyToDelete(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatLastUsed = (dateString: string | null) => {
    if (!dateString) return t('settings.apiKeys.neverUsed');
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('settings.apiKeys.today');
    if (diffDays === 1) return t('settings.apiKeys.yesterday');
    if (diffDays < 7) return t('settings.apiKeys.daysAgo', { days: diffDays });
    return formatDate(dateString);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">{t('settings.apiKeys.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <Check className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                {t('settings.apiKeys.title')}
              </CardTitle>
              <CardDescription className="mt-1.5">
                {t('settings.apiKeys.description')}
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.apiKeys.createButton')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('settings.apiKeys.noKeys')}</p>
              <p className="text-sm mt-1">{t('settings.apiKeys.noKeysHint')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Header row */}
              <div className="grid grid-cols-[1fr,auto,auto,auto,auto] gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
                <div>{t('settings.apiKeys.table.name')}</div>
                <div className="w-28">{t('settings.apiKeys.table.prefix')}</div>
                <div className="w-24">{t('settings.apiKeys.table.lastUsed')}</div>
                <div className="w-20">{t('settings.apiKeys.table.status')}</div>
                <div className="w-10"></div>
              </div>
              {/* API key rows */}
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className={`grid grid-cols-[1fr,auto,auto,auto,auto] gap-4 px-4 py-3 rounded-lg border items-center ${
                    key.is_revoked ? 'opacity-50' : ''
                  }`}
                >
                  <div>
                    <div className="font-medium">{key.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('settings.apiKeys.table.created')}: {formatDate(key.created_at)}
                    </div>
                  </div>
                  <div className="w-28">
                    <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
                      {key.key_prefix}...
                    </code>
                  </div>
                  <div className="w-24 text-sm text-muted-foreground">
                    {formatLastUsed(key.last_used_at)}
                  </div>
                  <div className="w-20">
                    {key.is_revoked ? (
                      <span className="text-destructive text-sm">
                        {t('settings.apiKeys.status.revoked')}
                      </span>
                    ) : key.expires_at && new Date(key.expires_at) < new Date() ? (
                      <span className="text-destructive text-sm">
                        {t('settings.apiKeys.status.expired')}
                      </span>
                    ) : (
                      <span className="text-green-600 dark:text-green-400 text-sm">
                        {t('settings.apiKeys.status.active')}
                      </span>
                    )}
                  </div>
                  <div className="w-10">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setKeyToDelete(key)}
                      className="text-destructive hover:text-destructive"
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

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.apiKeys.usage.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('settings.apiKeys.usage.description')}
          </p>
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-medium mb-2">{t('settings.apiKeys.usage.example')}</p>
            <code className="text-xs block bg-background p-3 rounded border">
              Authorization: Bearer vk_your_api_key_here
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('settings.apiKeys.usage.mcpHint')}
          </p>
        </CardContent>
      </Card>

      {/* Create Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.apiKeys.createDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.apiKeys.createDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">{t('settings.apiKeys.createDialog.nameLabel')}</Label>
              <Input
                id="key-name"
                placeholder={t('settings.apiKeys.createDialog.namePlaceholder')}
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newKeyName.trim()) {
                    handleCreateKey();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.apiKeys.createDialog.nameHint')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t('settings.apiKeys.createDialog.cancel')}
            </Button>
            <Button onClick={handleCreateKey} disabled={!newKeyName.trim() || creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('settings.apiKeys.createDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Newly Created Key Dialog */}
      <Dialog open={!!newlyCreatedKey} onOpenChange={() => setNewlyCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              {t('settings.apiKeys.createdDialog.title')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.apiKeys.createdDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {t('settings.apiKeys.createdDialog.warning')}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('settings.apiKeys.createdDialog.keyLabel')}</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    readOnly
                    value={showKey ? newlyCreatedKey?.key : '••••••••••••••••••••••••••••••••••••'}
                    className="font-mono pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => newlyCreatedKey && copyToClipboard(newlyCreatedKey.key)}
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewlyCreatedKey(null)}>
              {t('settings.apiKeys.createdDialog.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!keyToDelete} onOpenChange={() => setKeyToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.apiKeys.deleteDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.apiKeys.deleteDialog.description', { name: keyToDelete?.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {t('settings.apiKeys.deleteDialog.warning')}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setKeyToDelete(null)}>
              {t('settings.apiKeys.deleteDialog.cancel')}
            </Button>
            {keyToDelete && !keyToDelete.is_revoked && (
              <Button
                variant="outline"
                onClick={() => keyToDelete && handleRevokeKey(keyToDelete.id)}
                disabled={deleting}
              >
                {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('settings.apiKeys.deleteDialog.revoke')}
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => keyToDelete && handleDeleteKey(keyToDelete.id)}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('settings.apiKeys.deleteDialog.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
