import { useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import { cn } from '@/lib/utils';
import { useVisibleVariants } from './useVisibleVariants';

export interface VariantChipInputProps {
  // FileSearchTextarea props
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  projectId?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  maxRows?: number;

  // Variant props
  variants: string[];
  selectedVariant: string | null;
  onVariantSelect: (variant: string | null) => void;
  isAnimating?: boolean;
}

export function VariantChipInput({
  // Textarea props
  value,
  onChange,
  placeholder,
  rows = 1,
  disabled = false,
  className,
  projectId,
  onKeyDown,
  maxRows = 6,

  // Variant props
  variants,
  selectedVariant,
  onVariantSelect,
  isAnimating = false,
}: VariantChipInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chipRowRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const moreButtonRef = useRef<HTMLDivElement>(null);

  // Initialize chip refs array
  useEffect(() => {
    chipRefs.current = chipRefs.current.slice(0, variants.length);
  }, [variants.length]);

  const { visibleVariants, hiddenVariants, hasOverflow } = useVisibleVariants({
    variants,
    selectedVariant: selectedVariant || 'none', // Use a placeholder when no selection
    containerRef: chipRowRef,
    chipRefs,
    moreButtonRef,
  });

  // Calculate dynamic CSS variable for textarea padding
  useEffect(() => {
    if (!chipRowRef.current || !containerRef.current) return;

    const updatePadding = () => {
      const chipRow = chipRowRef.current;
      const container = containerRef.current;
      if (!chipRow || !container) return;

      const chipRowHeight = chipRow.scrollHeight;
      const paddingBottom = chipRowHeight + 12; // Add some extra space
      container.style.setProperty('--chip-padding-bottom', `${paddingBottom}px`);
      
      // Also update the textarea directly
      const textarea = container.querySelector('textarea');
      if (textarea) {
        textarea.style.paddingBottom = `${paddingBottom}px`;
      }
    };

    // Update padding on mount and when visible variants change
    const timer = setTimeout(updatePadding, 0);
    return () => clearTimeout(timer);
  }, [visibleVariants, hasOverflow]);

  const handleChipClick = (variant: string) => {
    // If clicking the same variant, deselect it (go back to default)
    const newVariant = selectedVariant === variant ? null : variant;
    onVariantSelect(newVariant);
    
    // Focus textarea to continue typing - find textarea within container
    const textarea = containerRef.current?.querySelector('textarea');
    if (textarea) {
      textarea.focus();
    }
  };

  const handleChipKeyDown = (e: React.KeyboardEvent, variant: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleChipClick(variant);
    }
  };

  if (variants.length === 0) {
    // No variants available, just show the textarea
    return (
      <FileSearchTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={cn("w-full", className)}
        projectId={projectId}
        onKeyDown={onKeyDown}
        maxRows={maxRows}
      />
    );
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className?.includes('flex-1') && 'flex-1')}>
      {/* Chip overlay - positioned at bottom of textarea */}
      <div
        ref={chipRowRef}
        className="absolute bottom-0 left-0 right-0 flex flex-wrap items-center gap-1 pl-3 pr-3 pb-2 pointer-events-none z-10"
      >
        {/* Visible variant chips */}
        {visibleVariants.map((variant) => {
          const isSelected = selectedVariant === variant;

          return (
            <div
              key={variant}
              ref={(el) => (chipRefs.current[variants.indexOf(variant)] = el)}
              className="pointer-events-auto"
            >
              <Badge
                variant={isSelected ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer transition-all select-none max-w-[120px] truncate uppercase',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'text-xs',
                  isAnimating && isSelected && 'scale-105 bg-accent'
                )}
                role="button"
                tabIndex={0}
                title={variant}
                onClick={(e) => {
                  e.stopPropagation();
                  handleChipClick(variant);
                }}
                onKeyDown={(e) => handleChipKeyDown(e, variant)}
              >
                {variant}
              </Badge>
            </div>
          );
        })}

        {/* Overflow dropdown */}
        {hasOverflow && (
          <div className="pointer-events-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  ref={moreButtonRef}
                  className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  role="button"
                  tabIndex={0}
                >
                  +{hiddenVariants.length}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {hiddenVariants.map((variant) => {
                  const isSelected = selectedVariant === variant;

                  return (
                    <DropdownMenuItem
                      key={variant}
                      onClick={() => handleChipClick(variant)}
                      className={cn("uppercase", isSelected ? 'bg-accent' : '')}
                    >
                      {variant}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Textarea */}
      <FileSearchTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full"
        projectId={projectId}
        onKeyDown={onKeyDown}
        maxRows={maxRows}
      />
    </div>
  );
}
