import { MousePointerClick, Trash2, ArrowBigLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClickedEntry } from '@/contexts/ClickedElementsProvider';
import { useState } from 'react';
import { Badge } from '../ui/badge';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';

export type Props = Readonly<{
  isEditable: boolean;
  appendInstructions?: (text: string) => void;
}>;

const MAX_VISIBLE_ELEMENTS = 5;

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

  const {
    visible: visibleElements,
  } = getVisibleElements(
    elements,
    isExpanded ? elements.length : MAX_VISIBLE_ELEMENTS
  );

  return (
    <div className="bg-bg flex flex-col gap-2 py-2">
      {visibleElements.map((element) => {
        return <ClickedEntryCard key={element.id} element={element} onDelete={() => removeElement(element.id)} />;
      })}
    </div>
  );
}

const ClickedEntryCard = ({ element, onDelete }: { element: ClickedEntry; onDelete: () => void }) => {
  return (
    <div className="flex gap-2 items-center">
      <MousePointerClick className="h-4 w-4 text-info" aria-hidden />

      {[...element.payload.components].reverse().map((component, i) => {
        return (
          <>{i > 0 && <ArrowBigLeft className="h-4 w-4" />}<Badge variant='default' className="text-sm" key={i}>&lt;{component.name}/&gt;</Badge></>);
      })}

      <Button size="sm" variant="ghost" className="px-0" onClick={onDelete} aria-label="Delete entry">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};
