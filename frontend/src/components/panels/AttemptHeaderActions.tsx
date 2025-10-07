import { X } from 'lucide-react';
import { Button } from '../ui/button';

interface AttemptHeaderActionsProps {
  onClose: () => void;
}

export const AttemptHeaderActions = ({
  onClose,
}: AttemptHeaderActionsProps) => {
  return (
    <Button variant="icon" aria-label="Close" onClick={onClose}>
      <X size={16} />
    </Button>
  );
};
