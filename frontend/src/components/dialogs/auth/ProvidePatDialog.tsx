import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUserSystem } from '@/components/config-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface ProvidePatDialogProps {
  errorMessage?: string;
}

export const ProvidePatDialog = NiceModal.create<ProvidePatDialogProps>(
  ({ errorMessage }) => {
    const modal = useModal();
    const { config, updateAndSaveConfig } = useUserSystem();
    const [pat, setPat] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
      if (!config) return;
      setSaving(true);
      setError(null);
      try {
        await updateAndSaveConfig({
          github: {
            ...config.github,
            pat,
          },
        });
        modal.resolve(true);
        modal.hide();
      } catch (err) {
        setError('Failed to save Personal Access Token');
      } finally {
        setSaving(false);
      }
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && modal.hide()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provide GitHub Personal Access Token</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p>
              {errorMessage ||
                'Your GitHub OAuth token does not have sufficient permissions to open a PR in this repository.'}
              <br />
              <br />
              Please provide a Personal Access Token with <b>repo</b>{' '}
              permissions.
            </p>
            <Input
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              autoFocus
            />
            <p className="text-sm text-muted-foreground">
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Create a token here
              </a>
            </p>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving || !pat || !config}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                modal.resolve(false);
                modal.hide();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
