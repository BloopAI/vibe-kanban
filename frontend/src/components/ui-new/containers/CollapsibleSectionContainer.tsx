import { useState } from 'react';
import { CollapsibleSection } from '@/components/ui-new/primitives/CollapsibleSection';

interface CollapsibleSectionContainerProps {
  title: string;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function CollapsibleSectionContainer({
  title,
  defaultExpanded = true,
  children,
  className,
}: CollapsibleSectionContainerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <CollapsibleSection
      title={title}
      expanded={expanded}
      onToggle={() => setExpanded((prev) => !prev)}
      className={className}
    >
      {children}
    </CollapsibleSection>
  );
}
