import { useExpandable } from '@/stores/useExpandableStore';
import { cn } from '@/lib/utils';
import { DiffViewCard } from '../primitives/conversation/DiffViewCard';
import type { DiffInput } from '../primitives/conversation/DiffViewCard';

interface DiffItemData {
  path: string;
  input: DiffInput;
  initialExpanded?: boolean;
}

interface ChangesPanelProps {
  className?: string;
  diffItems: DiffItemData[];
  onDiffRef?: (path: string, el: HTMLDivElement | null) => void;
}

export function ChangesPanel({
  className,
  diffItems,
  onDiffRef,
}: ChangesPanelProps) {
  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col p-base overflow-y-auto scrollbar-thin scrollbar-thumb-panel scrollbar-track-transparent',
        className
      )}
    >
      <div className="space-y-base">
        {diffItems.map(({ path, input, initialExpanded }) => (
          <DiffItem
            key={path}
            path={path}
            input={input}
            initialExpanded={initialExpanded}
            onRef={onDiffRef}
          />
        ))}
      </div>
      {diffItems.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-low">
          <p className="text-sm">No changes to display</p>
        </div>
      )}
    </div>
  );
}

function DiffItem({
  path,
  input,
  initialExpanded = true,
  onRef,
}: {
  path: string;
  input: DiffInput;
  initialExpanded?: boolean;
  onRef?: (path: string, el: HTMLDivElement | null) => void;
}) {
  const [expanded, toggle] = useExpandable(`diff:${path}`, initialExpanded);

  return (
    <div ref={(el) => onRef?.(path, el)}>
      <DiffViewCard input={input} expanded={expanded} onToggle={toggle} />
    </div>
  );
}
