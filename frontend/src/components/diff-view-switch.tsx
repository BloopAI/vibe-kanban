import { Columns, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDiffViewMode, useDiffViewStore } from '@/stores/useDiffViewStore';

type Props = {
  className?: string;
  size?: 'xs' | 'sm';
};

/**
 * Segmented switch for Inline vs Split diff modes.
 * - Left segment: Inline (Unified)
 * - Right segment: Split
 * Uses global Zustand store so changing here updates all diffs.
 */
export default function DiffViewSwitch({ className, size = 'xs' }: Props) {
  const mode = useDiffViewMode();
  const setMode = useDiffViewStore((s) => s.setMode);

  const isUnified = mode === 'unified';

  return (
    <div
      className={cn(
        'inline-flex rounded-md border border-input overflow-hidden',
        className
      )}
      role="group"
      aria-label="Diff view mode"
    >
      <Button
        variant={isUnified ? 'default' : 'outline'}
        size={size}
        className={cn(
          'rounded-none rounded-l-md h-6',
          !isUnified && 'bg-background',
          'gap-1',
          // Highlight the inner divider when right side is active
          !isUnified && 'border-r-foreground'
        )}
        aria-pressed={isUnified}
        onClick={() => setMode('unified')}
      >
        <FileText className="h-3 w-3" />
        <span className="text-[11px]">Inline</span>
      </Button>
      <Button
        variant={!isUnified ? 'default' : 'outline'}
        size={size}
        className={cn(
          'rounded-none rounded-r-md -ml-px h-6',
          isUnified && 'bg-background',
          'gap-1',
          // Ensure inner divider reflects active left side
          isUnified && 'border-l-foreground'
        )}
        aria-pressed={!isUnified}
        onClick={() => setMode('split')}
      >
        <Columns className="h-3 w-3" />
        <span className="text-[11px]">Split</span>
      </Button>
    </div>
  );
}
