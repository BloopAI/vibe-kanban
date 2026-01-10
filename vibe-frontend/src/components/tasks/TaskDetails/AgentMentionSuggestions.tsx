import { useEffect, useRef, useCallback } from 'react';
import { Bot, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentMention } from '@/hooks/useAgentMentions';

interface AgentMentionSuggestionsProps {
  suggestions: AgentMention[];
  selectedIndex: number;
  onSelect: (agent: AgentMention) => void;
  onClose: () => void;
  onNavigate: (direction: 'up' | 'down') => void;
  visible: boolean;
}

export function AgentMentionSuggestions({
  suggestions,
  selectedIndex,
  onSelect,
  onClose,
  onNavigate,
  visible,
}: AgentMentionSuggestionsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          onNavigate('down');
          break;
        case 'ArrowUp':
          e.preventDefault();
          onNavigate('up');
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (suggestions[selectedIndex]) {
            onSelect(suggestions[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [visible, selectedIndex, suggestions, onSelect, onClose, onNavigate]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md z-50"
      role="listbox"
      aria-label="Agent suggestions"
    >
      {suggestions.map((agent, index) => (
        <button
          key={agent.trigger}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            index === selectedIndex && 'bg-accent text-accent-foreground'
          )}
          onClick={() => onSelect(agent)}
        >
          <Bot className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{agent.displayName}</div>
            <div className="text-xs text-muted-foreground truncate">
              {agent.trigger}
            </div>
          </div>
          {agent.available && (
            <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
}
