import {
  MousePointerClick,
  Trash2,
  ArrowBigLeft,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClickedEntry } from '@/contexts/ClickedElementsProvider';
import { useState, useMemo } from 'react';
import { Badge } from '../ui/badge';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';

export type Props = Readonly<{
  isEditable: boolean;
  appendInstructions?: (text: string) => void;
}>;

const MAX_VISIBLE_ELEMENTS = 5;
const MAX_BADGES = 6;

// Build component chain from inner-most to outer-most for banner display
function buildChainInnerToOuterForBanner(entry: ClickedEntry) {
  const comps = entry.payload.components ?? [];
  const s = entry.payload.selected;

  // Start with selected as innermost, cast to ComponentInfo for uniform handling
  const innerToOuter = [s as any];

  // Add components that aren't duplicates
  const selectedKey = `${s.name}|${s.pathToSource}|${s.source?.lineNumber}|${s.source?.columnNumber}`;
  comps.forEach((c) => {
    const compKey = `${c.name}|${c.pathToSource}|${c.source?.lineNumber}|${c.source?.columnNumber}`;
    if (compKey !== selectedKey) {
      innerToOuter.push(c);
    }
  });

  return innerToOuter;
}

function getVisibleElements(
  elements: ClickedEntry[],
  max = MAX_VISIBLE_ELEMENTS
): { visible: ClickedEntry[]; total: number; hasMore: boolean } {
  // Show most recent elements first
  const reversed = [...elements].reverse();
  const visible = reversed.slice(0, max);
  return {
    visible,
    total: elements.length,
    hasMore: elements.length > visible.length,
  };
}

export function ClickedElementsBanner() {
  const [isExpanded] = useState(false);
  const { elements, removeElement } = useClickedElements();

  // Early return if no elements
  if (elements.length === 0) return null;

  const { visible: visibleElements } = getVisibleElements(
    elements,
    isExpanded ? elements.length : MAX_VISIBLE_ELEMENTS
  );

  return (
    <div className="bg-bg flex flex-col gap-2 py-2">
      {visibleElements.map((element) => {
        return (
          <ClickedEntryCard
            key={element.id}
            element={element}
            onDelete={() => removeElement(element.id)}
          />
        );
      })}
    </div>
  );
}

const ClickedEntryCard = ({
  element,
  onDelete,
}: {
  element: ClickedEntry;
  onDelete: () => void;
}) => {
  const { selectComponent } = useClickedElements();
  const chain = useMemo(
    () => buildChainInnerToOuterForBanner(element),
    [element]
  );
  const selectedDepth = element.selectedDepth ?? 0;

  // Truncate from the right side (outermost components), keep leftmost (innermost)
  const overflowRight = Math.max(0, chain.length - MAX_BADGES);
  const display = chain.slice(0, MAX_BADGES);

  const handleSelect = (visibleIdx: number) => {
    // Since we kept the leftmost items as-is, visibleIdx === depthFromInner
    selectComponent(element.id, visibleIdx);
  };

  return (
    <div className="flex gap-2 items-center min-w-0">
      <MousePointerClick className="h-4 w-4 text-info shrink-0" aria-hidden />

      <div className="flex items-center gap-1 overflow-hidden">
        {display.map((component, i) => {
          const depthFromInner = i; // Simple mapping since we keep left side
          const isDownstream = depthFromInner < selectedDepth;
          const isSelected = depthFromInner === selectedDepth;

          return (
            <div className="flex items-center" key={`${component.name}-${i}`}>
              {i > 0 && (
                <ArrowBigLeft className="h-4 w-4 opacity-60" aria-hidden />
              )}
              <button
                type="button"
                onClick={() => handleSelect(i)}
                className={`inline-flex items-center rounded px-2 py-0.5 text-sm transition ${
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:opacity-90'
                } ${isDownstream ? 'opacity-50 cursor-pointer' : ''}`}
                aria-pressed={isSelected}
                title={component.name}
              >
                &lt;{component.name}/&gt;
              </button>
            </div>
          );
        })}

        {overflowRight > 0 && (
          <div className="flex items-center">
            <ArrowBigLeft className="h-4 w-4 opacity-60" aria-hidden />
            <Badge
              variant="secondary"
              className="text-xs opacity-70 select-none"
              title={`${overflowRight} more outer components`}
            >
              <MoreHorizontal className="h-3 w-3" />
              <span className="ml-1">{overflowRight}</span>
            </Badge>
          </div>
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="px-0 ml-auto"
        onClick={onDelete}
        aria-label="Delete entry"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};
