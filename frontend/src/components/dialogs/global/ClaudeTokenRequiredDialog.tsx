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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Key,
  Terminal,
  Copy,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal, type NoProps } from '@/lib/modals';
import { claudeTokensApi } from '@/lib/api';

export type ClaudeTokenResult = {
  tokenConfigured: boolean;
};

const ClaudeTokenRequiredDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyCommand = async () => {
    await navigator.clipboard.writeText('claude setup-token');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToken = async () => {
    if (!token.trim()) {
      setError('Please enter your Claude Code OAuth token');
      return;
    }

    if (token.length < 20) {
      setError(
        'Token appears too short. Please paste the complete token from `claude setup-token`'
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await claudeTokensApi.upsertToken({ token });
      modal.resolve({ tokenConfigured: true } as ClaudeTokenResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save token. Please try again.'
      );
      setSaving(false);
    }
  };

  return (
    <Dialog open={modal.visible} uncloseable={true}>
      <DialogContent className="sm:max-w-[550px] space-y-4">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Key className="h-6 w-6 text-primary" />
            <DialogTitle>Claude Code Token Required</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            To use Vibe Kanban, you need to provide your Claude Code Max
            subscription token. This enables fair rotation of API usage across
            all team members.
          </DialogDescription>
        </DialogHeader>

        {/* Instructions */}
        <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="h-4 w-4" />
            How to get your token
          </div>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-1">
            <li>Open a terminal on your machine</li>
            <li className="flex items-center gap-2 flex-wrap">
              <span>Run the command:</span>
              <code className="bg-background px-2 py-1 rounded text-foreground font-mono text-xs">
                claude setup-token
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyCommand}
                className="h-6 px-2"
              >
                {copied ? (
                  <CheckCircle className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </li>
            <li>Follow the prompts to authenticate with your Claude Max account</li>
            <li>Copy the generated token and paste it below</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Note:</strong> You need a Claude Pro or Max subscription to
            generate OAuth tokens.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Token Input */}
        <div className="space-y-2">
          <Label htmlFor="claude-token">OAuth Token</Label>
          <Input
            id="claude-token"
            type="password"
            placeholder="Paste your token here..."
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setError(null);
            }}
            className="font-mono"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button
            onClick={handleSaveToken}
            disabled={saving || !token.trim()}
            className="w-full"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ClaudeTokenRequiredDialog = defineModal<void, ClaudeTokenResult>(
  ClaudeTokenRequiredDialogImpl
);
