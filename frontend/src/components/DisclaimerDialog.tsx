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
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface DisclaimerDialogProps {
  open: boolean;
  onAccept: () => void;
}

export function DisclaimerDialog({ open, onAccept }: DisclaimerDialogProps) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);

  const handleAccept = () => {
    if (acknowledged) {
      onAccept();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <DialogTitle>{t('disclaimer.title')}</DialogTitle>
          </div>
          <DialogDescription className="text-left space-y-4 pt-4">
            <p className="font-semibold text-foreground">
              {t('disclaimer.pleaseRead')}
            </p>
            <div className="space-y-3">
              <p>
                <strong>{t('disclaimer.fullAccess')}</strong>{' '}
                {t('disclaimer.executeCommands')}
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>{t('disclaimer.risks.software')}</li>
                <li>{t('disclaimer.risks.files')}</li>
                <li>{t('disclaimer.risks.network')}</li>
                <li>{t('disclaimer.risks.system')}</li>
              </ul>
              <p>
                <strong>
                  {t('disclaimer.experimental')}
                </strong>{' '}
                {t('disclaimer.acknowledgeUsage')}
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>{t('disclaimer.acknowledgeItems.ownRisk')}</li>
                <li>
                  {t('disclaimer.acknowledgeItems.noResponsibility')}
                </li>
                <li>
                  {t('disclaimer.acknowledgeItems.backups')}
                </li>
                <li>
                  {t('disclaimer.acknowledgeItems.consequences')}
                </li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2 py-4">
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            onCheckedChange={(checked: boolean) =>
              setAcknowledged(checked === true)
            }
          />
          <label
            htmlFor="acknowledge"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {t('disclaimer.checkboxLabel')}
          </label>
        </div>
        <DialogFooter>
          <Button
            onClick={handleAccept}
            disabled={!acknowledged}
            variant="destructive"
          >
{t('disclaimer.acceptButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
