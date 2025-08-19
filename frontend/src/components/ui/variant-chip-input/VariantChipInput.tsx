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
    selectedVariant: selectedVariant || 'Default',
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

      const chipRowWidth = chipRow.scrollWidth;
      const paddingLeft = chipRowWidth + 12; // Add some extra space
      container.style.setProperty('--chip-padding-left', `${paddingLeft}px`);
      
      // Also update the textarea directly
      const textarea = container.querySelector('textarea');
      if (textarea) {
        textarea.style.paddingLeft = `${paddingLeft}px`;
      }
    };

    // Update padding on mount and when visible variants change
    const timer = setTimeout(updatePadding, 0);
    return () => clearTimeout(timer);
  }, [visibleVariants, hasOverflow]);

  const handleChipClick = (variant: string) => {
    const newVariant = variant === 'Default' ? null : variant;
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
        className={className}
        projectId={projectId}
        onKeyDown={onKeyDown}
        maxRows={maxRows}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Chip overlay */}
      <div
        ref={chipRowRef}
        className="absolute inset-y-0 left-0 flex items-start gap-1 pl-3 pt-2 pointer-events-none z-10"
        style={{ maxWidth: 'calc(100% - 80px)' }} // Reserve space for send button
      >
        {/* Visible variant chips */}
        {visibleVariants.map((variant) => {
          const isSelected = (variant === 'Default' && !selectedVariant) || 
                           (selectedVariant === variant);
          
          return (
            <div
              key={variant}
              ref={el => chipRefs.current[variants.indexOf(variant)] = el}
              className="pointer-events-auto"
            >
              <Badge
                variant={isSelected ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer transition-all select-none max-w-[120px] truncate',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
                  const isSelected = (variant === 'Default' && !selectedVariant) || 
                                   (selectedVariant === variant);
                  
                  return (
                    <DropdownMenuItem
                      key={variant}
                      onClick={() => handleChipClick(variant)}
                      className={isSelected ? 'bg-accent' : ''}
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
        className={cn(className)}
        projectId={projectId}
        onKeyDown={onKeyDown}
        maxRows={maxRows}
      />
    </div>
  );
}
