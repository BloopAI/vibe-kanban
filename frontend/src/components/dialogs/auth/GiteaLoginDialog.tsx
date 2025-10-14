import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { useUserSystem } from '@/components/config-provider';
import { Check, Eye, EyeOff, Server } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { giteaAuthApi, GiteaConfigureResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

const GiteaLoginDialog = NiceModal.create(() => {
  const modal = useModal();
  const { config, loading, reloadSystem } = useUserSystem();
  const [giteaUrl, setGiteaUrl] = useState('');
  const [pat, setPat] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPat, setShowPat] = useState(false);

  const isConfigured =
    config?.git_platform?.platform_type === 'GITEA' &&
    !!config?.git_platform?.pat;

  const handleConfigure = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const result = await giteaAuthApi.configure(
        giteaUrl,
        pat,
        username || undefined
      );

      switch (result) {
        case GiteaConfigureResponse.SUCCESS:
          await reloadSystem();
          modal.resolve(true);
          modal.hide();
          break;
        case GiteaConfigureResponse.INVALID_URL:
          setError('Invalid Gitea URL. Please enter a valid URL (e.g., https://gitea.example.com)');
          break;
        case GiteaConfigureResponse.INVALID_TOKEN:
          setError('Invalid Personal Access Token. Please check your token and try again.');
          break;
        case GiteaConfigureResponse.ERROR:
          setError('Failed to configure Gitea. Please try again.');
          break;
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) {
          modal.resolve(isConfigured ? true : false);
          modal.hide();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Server className="h-6 w-6" />
            <DialogTitle>Configure Gitea</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-1">
            Connect to your self-hosted Gitea instance using a Personal Access
            Token.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <Loader message="Loading…" size={32} className="py-8" />
        ) : isConfigured ? (
          <div className="space-y-4 py-3">
            <Card>
              <CardContent className="text-center py-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Check className="h-8 w-8 text-green-500" />
                  <Server className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-lg font-medium mb-1">
                  Successfully connected!
                </div>
                <div className="text-sm text-muted-foreground">
                  Connected to{' '}
                  <b>{config?.git_platform?.gitea_url ?? 'Gitea'}</b>
                  {config?.git_platform?.username && (
                    <> as <b>{config.git_platform.username}</b></>
                  )}
                </div>
              </CardContent>
            </Card>
            <DialogFooter>
              <Button
                onClick={() => {
                  modal.resolve(true);
                  modal.hide();
                }}
                className="w-full"
              >
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  How to generate a Personal Access Token
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-sm text-muted-foreground">
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    Go to your Gitea instance settings →{' '}
                    <span className="font-medium">Applications</span> →{' '}
                    <span className="font-medium">
                      Manage Access Tokens
                    </span>
                  </li>
                  <li>Click "Generate New Token"</li>
                  <li>
                    Select scopes: <span className="font-medium">repo</span>,{' '}
                    <span className="font-medium">write:repository</span>
                  </li>
                  <li>Copy the generated token</li>
                </ol>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <div>
                <Label htmlFor="gitea-url">Gitea Instance URL *</Label>
                <Input
                  id="gitea-url"
                  type="url"
                  placeholder="https://gitea.example.com"
                  value={giteaUrl}
                  onChange={(e) => setGiteaUrl(e.target.value)}
                  disabled={submitting}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The URL of your self-hosted Gitea instance
                </p>
              </div>

              <div>
                <Label htmlFor="pat">Personal Access Token *</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="pat"
                    type={showPat ? 'text' : 'password'}
                    placeholder="Enter your Gitea PAT"
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    disabled={submitting}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPat(!showPat)}
                    disabled={submitting}
                  >
                    {showPat ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="username">Username (optional)</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="your-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={submitting}
                  className="mt-1.5"
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">⚠️</span>
                  <span>{error}</span>
                </div>
              </Alert>
            )}

            <DialogFooter className="gap-3 flex-col sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  modal.resolve(false);
                  modal.hide();
                }}
                className="flex-1"
                disabled={submitting}
              >
                Skip
              </Button>
              <Button
                onClick={handleConfigure}
                disabled={submitting || !giteaUrl || !pat}
                className="flex-1"
              >
                <Server className="h-4 w-4 mr-2" />
                {submitting ? 'Connecting…' : 'Connect to Gitea'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

export { GiteaLoginDialog };
