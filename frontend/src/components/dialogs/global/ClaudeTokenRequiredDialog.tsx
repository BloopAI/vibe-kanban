import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['settings', 'common']);
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
      setError(t('settings.claudeToken.errors.tokenRequired'));
      return;
    }

    if (token.length < 20) {
      setError(t('settings.claudeToken.errors.tokenTooShort'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await claudeTokensApi.upsertToken({ token });
      modal.resolve({ tokenConfigured: true } as ClaudeTokenResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('settings.claudeToken.errors.saveFailed')
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
            <DialogTitle>{t('settings.claudeToken.dialog.title')}</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            {t('settings.claudeToken.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Instructions */}
        <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="h-4 w-4" />
            {t('settings.claudeToken.instructions.title')}
          </div>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-1">
            <li>{t('settings.claudeToken.instructions.step1')}</li>
            <li className="flex items-center gap-2 flex-wrap">
              <span>{t('settings.claudeToken.instructions.step2Run')}</span>
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
            <li>{t('settings.claudeToken.instructions.step3')}</li>
            <li>{t('settings.claudeToken.instructions.step4')}</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>{t('common:note')}:</strong> {t('settings.claudeToken.instructions.note')}
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
          <Label htmlFor="claude-token">{t('settings.claudeToken.form.label')}</Label>
          <Input
            id="claude-token"
            type="password"
            placeholder={t('settings.claudeToken.form.placeholder')}
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
            {saving ? t('common:saving') : t('common:continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ClaudeTokenRequiredDialog = defineModal<void, ClaudeTokenResult>(
  ClaudeTokenRequiredDialogImpl
);
