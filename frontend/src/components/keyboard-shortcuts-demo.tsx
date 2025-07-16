import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function KeyboardShortcutsDemo() {
  const shortcuts = useKeyboardShortcuts({
    navigate: undefined,
    currentPath: '/demo',
    hasOpenDialog: false,
    closeDialog: () => {},
    onC: () => {},
  });

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Keyboard Shortcuts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Object.values(shortcuts).map((shortcut) => (
            <div
              key={shortcut.key}
              className="flex justify-between items-center"
            >
              <span className="text-sm">{shortcut.description}</span>
              <kbd className="px-2 py-1 text-xs bg-muted rounded border">
                {shortcut.key === 'KeyC' ? 'C' : shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
