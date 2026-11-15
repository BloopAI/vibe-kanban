import { cn } from '../lib/cn';

interface MicrosoftLogoProps {
  className?: string;
}

/**
 * Microsoft's official four-square logo.
 * Colors: Red (#F25022), Green (#7FBA00), Blue (#00A4EF), Yellow (#FFB900)
 */
export function MicrosoftLogo({ className }: MicrosoftLogoProps) {
  return (
    <svg
      className={cn('size-5', className)}
      viewBox="0 0 21 21"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
