import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './KeyboardDialog';
import { Button } from './Button';
import { Input } from './Input';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '../lib/modals';

export interface RenameSessionDialogProps {
  currentName: string;
  onRename: (newName: string) => Promise<void>;
}

export type RenameSessionDialogResult = {
  action: 'confirmed' | 'canceled';
  name?: string;
};

const RenameSessionDialogImpl = NiceModal.create<RenameSessionDialogProps>(
  ({ currentName, onRename }) => {
    const modal = useModal();
    const { t } = useTranslation(['tasks']);
    const [name, setName] = useState<string>(currentName);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
      if (modal.visible) {
        setName(currentName);
        setError(null);
        setIsSubmitting(false);
      }
    }, [modal.visible, currentName]);

    const handleConfirm = async () => {
      const trimmedName = name.trim();

      if (trimmedName === currentName) {
        modal.resolve({ action: 'canceled' } as RenameSessionDialogResult);
        modal.hide();
        return;
      }

      setIsSubmitting(true);
      setError(null);
      try {
        await onRename(trimmedName);
        modal.resolve({
          action: 'confirmed',
          name: trimmedName,
        } as RenameSessionDialogResult);
        modal.hide();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to rename session'
        );
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as RenameSessionDialogResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('conversation.sessions.renameTitle')}</DialogTitle>
            <DialogDescription>
              {t('conversation.sessions.renameDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                id="session-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSubmitting) {
                    void handleConfirm();
                  }
                }}
                placeholder={t('conversation.sessions.renamePlaceholder')}
                disabled={isSubmitting}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              onClick={() => void handleConfirm()}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t('conversation.sessions.renaming')
                : t('conversation.sessions.rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const RenameSessionDialog = defineModal<
  RenameSessionDialogProps,
  RenameSessionDialogResult
>(RenameSessionDialogImpl);
