import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
import { usePortalContainer } from '@/contexts/PortalContainerContext';
import { getModifierKey } from '@/utils/platform';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({
  children,
  content,
  shortcut,
  side = 'bottom',
  className,
}: TooltipProps) {
  const container = usePortalContainer();
  const formattedShortcut = shortcut?.replace('{mod}', getModifierKey());

  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={4}
            className={cn(
              'z-[10000] flex items-center rounded-sm bg-panel px-base py-half text-xs text-normal shadow-md',
              'animate-in fade-in-0 zoom-in-95',
              className
            )}
          >
            <span>{content}</span>
            {formattedShortcut && (
              <kbd
                className={cn(
                  'ml-2 inline-flex items-center gap-0.5 px-2 py-0.5',
                  'rounded-sm border border-border bg-secondary',
                  'font-ibm-plex-mono text-xs text-high'
                )}
              >
                {formattedShortcut}
              </kbd>
            )}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
