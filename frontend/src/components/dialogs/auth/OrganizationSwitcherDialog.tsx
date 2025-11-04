import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { OrganizationSwitcher } from '@clerk/clerk-react';
import { useEffect, useRef } from 'react';

export type OrganizationSwitcherDialogProps = {
  title?: string;
};

const OrganizationSwitcherDialog =
  NiceModal.create<OrganizationSwitcherDialogProps>((props) => {
    const modal = useModal();
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const timer = setTimeout(() => {
        const button = wrapperRef.current?.querySelector<HTMLButtonElement>(
          '.org-switcher-auto-open'
        );
        button?.click();
      }, 0);
      return () => clearTimeout(timer);
    }, []);

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        modal.remove();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{props.title ?? 'Switch organization'}</DialogTitle>
          </DialogHeader>
          <div ref={wrapperRef}>
            <OrganizationSwitcher
              hidePersonal
              afterCreateOrganizationUrl="/"
              afterSelectOrganizationUrl="/"
              afterLeaveOrganizationUrl="/"
              organizationProfileMode="modal"
              createOrganizationMode="modal"
              appearance={{
                elements: {
                  rootBox: 'org-switcher-auto-open w-full',
                },
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  });

export { OrganizationSwitcherDialog };
