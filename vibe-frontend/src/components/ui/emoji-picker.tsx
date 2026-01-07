import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Common emojis organized by category for teams/projects
const EMOJI_CATEGORIES = {
  teams: ['👥', '👨‍💻', '👩‍💼', '🏢', '🏠', '🎯', '⚡', '🚀', '💼', '🔧'],
  objects: ['📁', '📂', '📊', '📈', '📉', '📋', '📝', '📌', '🗂️', '💡'],
  symbols: ['⭐', '✨', '💎', '🔥', '❤️', '💚', '💙', '💜', '🧡', '💛'],
  nature: ['🌟', '🌙', '☀️', '🌈', '🌊', '🌲', '🌸', '🍀', '🌻', '🦋'],
  misc: ['🎨', '🎬', '🎮', '🎵', '📱', '💻', '🔒', '🔑', '⚙️', '🛠️'],
};

const ALL_EMOJIS = Object.values(EMOJI_CATEGORIES).flat();

interface EmojiPickerProps {
  value: string | null;
  onChange: (emoji: string) => void;
  className?: string;
}

export function EmojiPicker({ value, onChange, className }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          type="button"
          className={cn(
            'h-14 w-14 text-2xl flex items-center justify-center hover:bg-accent',
            className
          )}
        >
          {value || '😀'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-8 gap-1">
          {ALL_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={cn(
                'h-8 w-8 flex items-center justify-center text-lg rounded hover:bg-accent transition-colors',
                value === emoji && 'bg-accent ring-2 ring-primary'
              )}
              onClick={() => handleSelect(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
