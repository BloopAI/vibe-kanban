import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleOutputProps {
  content: string;
  toolName?: string;
  className?: string;
  maxLinesCollapsed?: number;
  alwaysShowIcon?: boolean;
}

export function CollapsibleOutput({
  content,
  toolName,
  className,
  maxLinesCollapsed = 10,
  alwaysShowIcon = false,
}: CollapsibleOutputProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { lines, shouldCollapse, displayLines } = useMemo(() => {
    const allLines = content.split('\n');
    const shouldCollapse = allLines.length > maxLinesCollapsed;
    const displayLines = shouldCollapse && !isExpanded 
      ? allLines.slice(0, maxLinesCollapsed)
      : allLines;
    
    return { lines: allLines, shouldCollapse, displayLines };
  }, [content, maxLinesCollapsed, isExpanded]);

  const isCommandOutput = toolName?.toLowerCase() === 'bash' || 
                         toolName?.toLowerCase() === 'run_command';

  if (!shouldCollapse && !alwaysShowIcon) {
    return (
      <div className={cn('font-mono text-sm', className)}>
        {content}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(shouldCollapse || alwaysShowIcon) && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex items-center gap-2 text-xs font-medium transition-colors',
            'hover:text-foreground/80',
            isCommandOutput ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {isCommandOutput && <Terminal className="h-3 w-3" />}
          <span>
            {isExpanded ? 'Collapse' : 'Expand'} output
            {shouldCollapse && ` (${lines.length} lines)`}
          </span>
        </button>
      )}
      
      <div 
        className={cn(
          'font-mono text-sm overflow-x-auto',
          'bg-muted/30 dark:bg-muted/10 rounded-md p-3',
          'border border-border/50',
          className
        )}
      >
        <pre className="whitespace-pre-wrap break-words">
          {displayLines.join('\n')}
          {shouldCollapse && !isExpanded && (
            <span className="text-muted-foreground">
              {'\n'}... {lines.length - maxLinesCollapsed} more lines
            </span>
          )}
        </pre>
      </div>
    </div>
  );
}