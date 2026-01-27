import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { usePortalContainer } from '@/contexts/PortalContainerContext';

// Common reaction emojis
const REACTION_EMOJIS = [
  '👍',
  '👎',
  '❤️',
  '😄',
  '😢',
  '🎉',
  '🚀',
  '👀',
  '🔥',
  '💯',
  '✅',
  '❌',
  '🤔',
  '👏',
  '💪',
  '🙌',
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  children: React.ReactNode;
}

export function EmojiPicker({ onSelect, children }: EmojiPickerProps) {
  const [open, setOpen] = React.useState(false);
  const container = usePortalContainer();

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={container}>
        <PopoverPrimitive.Content
          sideOffset={4}
          className={cn(
            'z-[10000] bg-panel border border-border rounded-sm p-base shadow-md',
            'data-[state=open]:animate-in',
            'data-[state=open]:fade-in-0',
            'data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2',
            'data-[side=top]:slide-in-from-bottom-2',
            'origin-[--radix-popover-content-transform-origin]'
          )}
        >
          <div className="grid grid-cols-8 gap-half">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelect(emoji)}
                className={cn(
                  'size-7 flex items-center justify-center rounded-sm',
                  'hover:bg-secondary transition-colors',
                  'text-base color-emoji'
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
