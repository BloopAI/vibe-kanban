import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { attemptsApi } from '@/lib/api';
import { defineModal } from '@/lib/modals';
import { Unplug } from 'lucide-react';
import { PortsList } from '@/components/tasks/TaskDetails/PortsList';

interface AssignedPortsDialogProps {
  attemptId: string;
  assignedPorts: string | null;
  onPortsReleased?: () => void;
}

const AssignedPortsDialogImpl = NiceModal.create<AssignedPortsDialogProps>(
  ({ attemptId, assignedPorts, onPortsReleased }) => {
    const { t } = useTranslation('tasks');
    const modal = useModal();
    const [isReleasing, setIsReleasing] = useState(false);

    const ports: Record<string, number> = assignedPorts
      ? JSON.parse(assignedPorts)
      : {};
    const hasPorts = Object.keys(ports).length > 0;

    const handleReleasePorts = async () => {
      setIsReleasing(true);
      try {
        await attemptsApi.releasePorts(attemptId);
        onPortsReleased?.();
        modal.hide();
      } catch (error) {
        console.error('Failed to release ports:', error);
      } finally {
        setIsReleasing(false);
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={(open) => !open && modal.hide()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('assignedPorts.title')}</DialogTitle>
            <DialogDescription>
              {hasPorts
                ? t('assignedPorts.description')
                : t('assignedPorts.noPortsDescription')}
            </DialogDescription>
          </DialogHeader>

          {hasPorts && (
            <div className="py-4">
              <PortsList ports={ports} />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => modal.hide()}>
              {t('common:buttons.close')}
            </Button>
            {hasPorts && (
              <Button
                variant="destructive"
                onClick={handleReleasePorts}
                disabled={isReleasing}
              >
                <Unplug className="h-4 w-4 mr-2" />
                {isReleasing
                  ? t('assignedPorts.releasing')
                  : t('assignedPorts.releasePorts')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const AssignedPortsDialog = defineModal<
  AssignedPortsDialogProps,
  void
>(AssignedPortsDialogImpl);
