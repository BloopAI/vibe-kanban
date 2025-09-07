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
import NiceModal, { useModal } from '@ebay/nice-modal-react';

const DisclaimerDialog = NiceModal.create(() => {
  const modal = useModal();
  const [acknowledged, setAcknowledged] = useState(false);

  const handleAccept = () => {
    if (acknowledged) {
      modal.resolve('accepted');
    }
  };

  return (
    <Dialog open={modal.visible} uncloseable={true}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <DialogTitle>Important Safety Warning</DialogTitle>
          </div>
          <DialogDescription className="text-left space-y-4 pt-4">
            <p className="font-semibold text-foreground">
              Please read and acknowledge the following before proceeding:
            </p>
            <div className="space-y-3">
              <p>
                <strong>Coding agents have full access to your computer</strong>{' '}
                and can execute any terminal commands, including:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Installing, modifying, or deleting software</li>
                <li>Accessing, creating, or removing files and directories</li>
                <li>Making network requests and connections</li>
                <li>Running system-level commands with your permissions</li>
              </ul>
              <p>
                <strong>
                  This software is experimental and may cause catastrophic
                  damage
                </strong>{' '}
                to your system, data, or projects. By using this software, you
                acknowledge that:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>You use this software entirely at your own risk</li>
                <li>
                  The developers are not responsible for any damage, data loss,
                  or security issues
                </li>
                <li>
                  You should have proper backups of important data before using
                  this software
                </li>
                <li>
                  You understand the potential consequences of granting
                  unrestricted system access
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
            I understand and acknowledge the risks described above. I am aware
            that coding agents have full access to my computer and may cause
            catastrophic damage.
          </label>
        </div>
        <DialogFooter>
          <Button
            onClick={handleAccept}
            disabled={!acknowledged}
            variant="destructive"
          >
            I Accept the Risks and Want to Proceed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { DisclaimerDialog };
