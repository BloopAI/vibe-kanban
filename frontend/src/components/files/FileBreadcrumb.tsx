import { ChevronRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileBreadcrumbProps {
  currentPath: string | null;
  onNavigate: (path: string | null) => void;
  className?: string;
}

/**
 * Breadcrumb navigation for file browser
 * Shows path segments that can be clicked to navigate
 */
export function FileBreadcrumb({
  currentPath,
  onNavigate,
  className,
}: FileBreadcrumbProps) {
  // Parse path into segments
  const segments = currentPath
    ? currentPath.split('/').filter((s) => s.length > 0)
    : [];

  // Build cumulative paths for each segment
  const paths = segments.map((_, index) =>
    segments.slice(0, index + 1).join('/')
  );

  return (
    <nav
      className={cn('flex items-center gap-1 min-w-0 overflow-x-auto', className)}
      aria-label="File path breadcrumb"
    >
      {/* Root/Home button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onNavigate(null)}
        className="h-7 px-2 flex-shrink-0"
        title="Go to root"
      >
        <Home className="h-4 w-4" />
      </Button>

      {segments.length > 0 && (
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      )}

      {/* Path segments */}
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const segmentPath = paths[index];

        return (
          <div key={segmentPath} className="flex items-center gap-1 min-w-0">
            {isLast ? (
              // Last segment - not clickable, shows current location
              <span
                className="text-sm font-medium truncate max-w-[150px]"
                title={segment}
              >
                {segment}
              </span>
            ) : (
              // Intermediate segment - clickable
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate(segmentPath)}
                  className="h-7 px-2 text-muted-foreground hover:text-foreground truncate max-w-[120px]"
                  title={segment}
                >
                  {segment}
                </Button>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default FileBreadcrumb;
