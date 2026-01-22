import { useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  Key,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { claudeTokensApi } from '@/lib/api';
import type { ClaudeOAuthTokenStatus, UserTokenStatus } from 'shared/types';

export function ClaudeTokenSettings() {
  const { t } = useTranslation(['settings', 'common']);
  const [tokenStatus, setTokenStatus] = useState<ClaudeOAuthTokenStatus | null>(
    null
  );
  const [allStatuses, setAllStatuses] = useState<UserTokenStatus[]>([]);
  const [newToken, setNewToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch current token status
  useEffect(() => {
    fetchTokenStatus();
    fetchAllStatuses();
  }, []);

  const fetchTokenStatus = async () => {
    setLoading(true);
    try {
      const status = await claudeTokensApi.getMyStatus();
      setTokenStatus(status);
      setError(null);
    } catch (err) {
      setError('Failed to fetch token status');
      console.error('Failed to fetch token status:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllStatuses = async () => {
    try {
      const statuses = await claudeTokensApi.getAllStatuses();
      setAllStatuses(statuses);
    } catch (err) {
      console.error('Failed to fetch all token statuses:', err);
    }
  };

  const handleSaveToken = async () => {
    if (!newToken.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const status = await claudeTokensApi.upsertToken({ token: newToken });
      setTokenStatus(status);
      setNewToken('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      // Refresh all statuses
      fetchAllStatuses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save token');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteToken = async () => {
    if (
      !confirm(
        'Are you sure you want to delete your Claude Code token? This will prevent you from running Claude Code tasks until you add a new token.'
      )
    )
      return;

    setDeleting(true);
    setError(null);

    try {
      await claudeTokensApi.deleteMyToken();
      setTokenStatus({
        has_token: false,
        token_hint: null,
        created_at: null,
        expires_at: null,
        last_used_at: null,
        is_expired: false,
      });
      // Refresh all statuses
      fetchAllStatuses();
    } catch (err) {
      setError('Failed to delete token');
    } finally {
      setDeleting(false);
    }
  };

  const copyCommand = () => {
    navigator.clipboard.writeText('claude setup-token');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Token Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t('settings.claudeToken.title', 'Claude Code OAuth Token')}
          </CardTitle>
          <CardDescription>
            {t(
              'settings.claudeToken.description',
              'Configure your Claude Code authentication token for executing coding tasks. Tokens are rotated among all team members.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Token Status Display */}
          {tokenStatus?.has_token ? (
            <div
              className={`flex items-center gap-2 p-3 rounded-md ${
                tokenStatus.is_expired
                  ? 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800'
                  : 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800'
              }`}
            >
              {tokenStatus.is_expired ? (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-600" />
              )}
              <span className="flex-1">
                {t('settings.claudeToken.statusConfigured', 'Token configured')}
                : {tokenStatus.token_hint}
              </span>
              {tokenStatus.is_expired && (
                <Badge variant="destructive">
                  {t('settings.claudeToken.expired', 'Expired')}
                </Badge>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span>
                {t(
                  'settings.claudeToken.statusMissing',
                  'No token configured. Add a token to run Claude Code.'
                )}
              </span>
            </div>
          )}

          {/* Success Alert */}
          {success && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                {t('settings.claudeToken.saveSuccess', 'Token saved successfully!')}
              </AlertDescription>
            </Alert>
          )}

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Setup Instructions */}
          <div className="space-y-3">
            <Label>
              {t('settings.claudeToken.howToGet', 'How to get your token')}
            </Label>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
              <li>{t('settings.claudeToken.step1', 'Open a terminal')}</li>
              <li className="flex items-center gap-2">
                <span>{t('settings.claudeToken.step2', 'Run:')}</span>
                <code className="bg-muted px-2 py-1 rounded text-foreground font-mono">
                  claude setup-token
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyCommand}
                  className="h-6 px-2"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </li>
              <li>
                {t(
                  'settings.claudeToken.step3',
                  'Follow the OAuth login flow in your browser'
                )}
              </li>
              <li>
                {t(
                  'settings.claudeToken.step4',
                  'Copy the token output and paste it below'
                )}
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">
              {t(
                'settings.claudeToken.note',
                'Note: You need a Claude Pro or Max subscription to generate OAuth tokens.'
              )}
            </p>
          </div>

          {/* Token Input */}
          <div className="space-y-2">
            <Label htmlFor="claude-token">
              {tokenStatus?.has_token
                ? t('settings.claudeToken.updateToken', 'Update Token')
                : t('settings.claudeToken.addToken', 'Add Token')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="claude-token"
                type="password"
                placeholder={t(
                  'settings.claudeToken.placeholder',
                  'Paste your token here...'
                )}
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                className="font-mono"
              />
              <Button
                onClick={handleSaveToken}
                disabled={saving || !newToken.trim()}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common:save', 'Save')}
              </Button>
            </div>
          </div>

          {/* Delete Token Button */}
          {tokenStatus?.has_token && (
            <div className="pt-4 border-t">
              <Button
                variant="destructive"
                onClick={handleDeleteToken}
                disabled={deleting}
              >
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Trash2 className="mr-2 h-4 w-4" />
                {t('settings.claudeToken.deleteToken', 'Delete Token')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Token Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {t('settings.claudeToken.teamTokens', 'Team Token Pool')}
              </CardTitle>
              <CardDescription>
                {t(
                  'settings.claudeToken.teamDescription',
                  'Overview of all team members\' token status. Tokens are rotated among available members.'
                )}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchTokenStatus();
                fetchAllStatuses();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common:refresh', 'Refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {allStatuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('settings.claudeToken.noUsers', 'No users found.')}
            </p>
          ) : (
            <div className="space-y-2">
              {allStatuses.map((userStatus) => (
                <div
                  key={userStatus.user_id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div className="flex items-center gap-3">
                    {userStatus.avatar_url && (
                      <img
                        src={userStatus.avatar_url}
                        alt={userStatus.username}
                        className="h-8 w-8 rounded-full"
                      />
                    )}
                    <div>
                      <p className="font-medium">
                        {userStatus.display_name || userStatus.username}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        @{userStatus.username}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {userStatus.token_status.has_token ? (
                      <>
                        {userStatus.token_status.is_expired ? (
                          <Badge variant="destructive">
                            {t('settings.claudeToken.teamPool.status.expired')}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-green-600 border-green-600"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t('settings.claudeToken.teamPool.status.active')}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground font-mono">
                          {userStatus.token_status.token_hint}
                        </span>
                      </>
                    ) : (
                      <Badge variant="secondary">
                        {t('settings.claudeToken.teamPool.status.missing')}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 p-3 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              <strong>
                {allStatuses.filter((s) => s.token_status.has_token && !s.token_status.is_expired).length}
              </strong>{' '}
              {t(
                'settings.claudeToken.activeTokens',
                'active tokens available for rotation'
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
