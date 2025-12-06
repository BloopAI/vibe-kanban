import { Button } from '@/components/ui/button';
import { Terminal } from 'lucide-react';

type OpenInTerminalButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

export function OpenInTerminalButton({
  onClick,
  disabled = false,
  className,
}: OpenInTerminalButtonProps) {
  const label = 'Open in Terminal';

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-10 w-10 p-0 hover:opacity-70 transition-opacity ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Terminal className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}
