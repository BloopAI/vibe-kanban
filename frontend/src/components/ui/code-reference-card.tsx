import { FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CodeReferenceData {
  filePath: string;
  lineNumber: number;
  side: 'old' | 'new';
  codeLine: string;
}

export interface CodeReferenceCardProps extends CodeReferenceData {
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  className?: string;
}

/**
 * CodeReferenceCard - Displays a code reference inline in the WYSIWYG editor
 *
 * Shows file path, line number, side indicator, and code snippet.
 * Click scrolls to the line in the diff view.
 * Double-click converts back to editable markdown.
 */
export function CodeReferenceCard({
  filePath,
  lineNumber,
  side,
  codeLine,
  onClick,
  onDoubleClick,
  className,
}: CodeReferenceCardProps) {
  return (
    <span
      className={cn(
        'inline-flex flex-col gap-1 p-2 bg-muted/50 rounded-md border',
        'border-border cursor-pointer hover:border-primary/50 transition-colors',
        'align-bottom max-w-md',
        className
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-1.5 text-xs">
        <FileCode className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="font-mono text-primary/80 truncate">
          {filePath}
          <span className="text-muted-foreground">:{lineNumber}</span>
        </span>
        <span
          className={cn(
            'text-[10px] px-1 py-0.5 rounded font-medium flex-shrink-0',
            side === 'old'
              ? 'bg-red-500/20 text-red-700 dark:text-red-400'
              : 'bg-green-500/20 text-green-700 dark:text-green-400'
          )}
        >
          {side}
        </span>
      </div>
      {codeLine && (
        <pre className="text-xs font-mono bg-secondary rounded px-2 py-1 overflow-x-auto whitespace-pre">
          <code>{codeLine}</code>
        </pre>
      )}
    </span>
  );
}
