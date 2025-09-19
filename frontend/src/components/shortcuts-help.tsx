import { useState } from 'react';
import { useKeyboardShortcutsRegistry } from '@/contexts/keyboard-shortcuts-context';
import { useKeyShowHelp, Scope } from '@/keyboard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const { shortcuts } = useKeyboardShortcutsRegistry();

  // Global shortcut to open help using semantic hook
  useKeyShowHelp(() => setIsOpen(true), { scope: Scope.GLOBAL });

  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      const group = shortcut.group || 'Other';
      if (!acc[group]) acc[group] = [];
      acc[group].push(shortcut);
      return acc;
    },
    {} as Record<string, typeof shortcuts>
  );

  const formatKeys = (keys: string | string[]) => {
    if (Array.isArray(keys)) {
      return keys.join(' or ');
    }
    return keys;
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {Object.entries(groupedShortcuts).map(([group, shortcuts]) => (
            <div key={group}>
              <h3 className="text-lg font-medium mb-3">{group}</h3>
              <div className="space-y-2">
                {shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex justify-between items-center py-1"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                      {formatKeys(shortcut.keys)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground mt-4 pt-4 border-t">
          Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">?</kbd> to
          open this help dialog
        </div>
      </DialogContent>
    </Dialog>
  );
}
