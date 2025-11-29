import Markdown from 'markdown-to-jsx';
import { memo, useMemo, useState, useCallback } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Check, Clipboard, ImageOff } from 'lucide-react';
import { writeClipboardViaBridge } from '@/vscode/bridge';
import { ImageLightboxDialog } from '@/components/dialogs';
import { cn } from '@/lib/utils';
import type { ImageResponse } from 'shared/types';

const HIGHLIGHT_LINK =
  'rounded-sm bg-muted/50 px-1 py-0.5 underline-offset-2 transition-colors';
const HIGHLIGHT_LINK_HOVER = 'hover:bg-muted';
const HIGHLIGHT_CODE = 'rounded-sm bg-muted/50 px-1 py-0.5 font-mono text-sm';

function sanitizeHref(href?: string): string | undefined {
  if (typeof href !== 'string') return undefined;
  const trimmed = href.trim();
  // Block dangerous protocols
  if (/^(javascript|vbscript|data):/i.test(trimmed)) return undefined;
  // Allow anchors and common relative forms
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/')
  )
    return trimmed;
  // Allow only https
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  // Block everything else by default
  return undefined;
}

function isExternalHref(href?: string): boolean {
  if (!href) return false;
  return /^https:\/\//i.test(href);
}

function LinkOverride({
  href,
  children,
  title,
}: {
  href?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const rawHref = typeof href === 'string' ? href : '';
  const safeHref = sanitizeHref(rawHref);

  const external = isExternalHref(safeHref);
  const internalOrDisabled = !external;

  if (!safeHref || internalOrDisabled) {
    // Disabled internal link (relative paths and anchors)
    return (
      <span
        role="link"
        aria-disabled="true"
        title={title || rawHref || undefined}
        className={`${HIGHLIGHT_LINK} cursor-not-allowed select-text`}
      >
        {children}
      </span>
    );
  }

  // External link
  return (
    <a
      href={safeHref}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      className={`${HIGHLIGHT_LINK} ${HIGHLIGHT_LINK_HOVER} underline`}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {children}
    </a>
  );
}

function InlineCodeOverride({
  children,
  className,
  ...props
}: React.ComponentProps<'code'>) {
  // Only highlight inline code, not fenced code blocks
  const hasLanguage =
    typeof className === 'string' && /\blanguage-/.test(className);
  if (hasLanguage) {
    // Likely a fenced block's <code>; leave className as-is for syntax highlighting
    return (
      <code {...props} className={className}>
        {children}
      </code>
    );
  }
  return (
    <code
      {...props}
      className={`${HIGHLIGHT_CODE}${className ? ` ${className}` : ''}`}
    >
      {children}
    </code>
  );
}

// Check if src is a .vibe-images path
function isVibeImagePath(src?: string): boolean {
  if (!src) return false;
  return src.startsWith('.vibe-images/');
}

// Find image by matching file_path against taskImages
function findImageByPath(
  src: string,
  taskImages?: ImageResponse[]
): ImageResponse | null {
  if (!taskImages) return null;
  return taskImages.find((img) => img.file_path === src) || null;
}

// Image override component factory (captures taskImages for lightbox navigation)
function createImageOverride(taskImages?: ImageResponse[]) {
  return function ImageOverride({ src, alt }: { src?: string; alt?: string }) {
    const [error, setError] = useState(false);

    // Check if this is a .vibe-images path and find matching image
    const isVibeImage = isVibeImagePath(src);
    const matchedImage = isVibeImage ? findImageByPath(src!, taskImages) : null;

    // Determine the URL to use
    const imageUrl = matchedImage
      ? `/api/images/${matchedImage.id}/file`
      : src || '';

    const handleClick = useCallback(() => {
      if (!matchedImage) return;

      if (taskImages && taskImages.length > 0) {
        // Find index of clicked image in task images
        const index = taskImages.findIndex((img) => img.id === matchedImage.id);
        void ImageLightboxDialog.show({
          images: taskImages,
          initialIndex: index >= 0 ? index : 0,
          readOnly: true,
        });
      } else {
        // Fallback: single image
        void ImageLightboxDialog.show({
          images: [matchedImage],
          initialIndex: 0,
          readOnly: true,
        });
      }
    }, [matchedImage]);

    if (error) {
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
          <ImageOff className="h-4 w-4" />
          [Image failed to load]
        </span>
      );
    }

    return (
      <img
        src={imageUrl}
        alt={alt || ''}
        onClick={matchedImage ? handleClick : undefined}
        onError={() => setError(true)}
        className={cn(
          'max-w-full rounded my-2',
          matchedImage && 'cursor-pointer hover:opacity-90 transition-opacity'
        )}
      />
    );
  };
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
  enableCopyButton?: boolean;
  taskImages?: ImageResponse[]; // For lightbox navigation with all task images
}

function MarkdownRenderer({
  content,
  className = '',
  enableCopyButton = false,
  taskImages,
}: MarkdownRendererProps) {
  // Create image override dynamically to capture taskImages for lightbox
  const imageOverride = useMemo(
    () => createImageOverride(taskImages),
    [taskImages]
  );

  const overrides = useMemo(
    () => ({
      a: { component: LinkOverride },
      code: { component: InlineCodeOverride },
      img: { component: imageOverride },
      strong: {
        component: ({ children, ...props }: React.ComponentProps<'strong'>) => (
          <span {...props} className="">
            {children}
          </span>
        ),
      },
      em: {
        component: ({ children, ...props }: React.ComponentProps<'em'>) => (
          <em {...props} className="italic">
            {children}
          </em>
        ),
      },
      p: {
        component: ({ children, ...props }: React.ComponentProps<'p'>) => (
          <p {...props} className="leading-tight my-2">
            {children}
          </p>
        ),
      },
      h1: {
        component: ({ children, ...props }: React.ComponentProps<'h1'>) => (
          <h1
            {...props}
            className="text-lg font-medium leading-tight mt-4 mb-2"
          >
            {children}
          </h1>
        ),
      },
      h2: {
        component: ({ children, ...props }: React.ComponentProps<'h2'>) => (
          <h2
            {...props}
            className="text-base font-medium leading-tight mt-4 mb-2"
          >
            {children}
          </h2>
        ),
      },
      h3: {
        component: ({ children, ...props }: React.ComponentProps<'h3'>) => (
          <h3 {...props} className="text-sm leading-tight mt-3 mb-2">
            {children}
          </h3>
        ),
      },
      ul: {
        component: ({ children, ...props }: React.ComponentProps<'ul'>) => (
          <ul
            {...props}
            className="list-disc list-outside ps-6 my-3 space-y-1.5"
          >
            {children}
          </ul>
        ),
      },
      ol: {
        component: ({ children, ...props }: React.ComponentProps<'ol'>) => (
          <ol
            {...props}
            className="list-decimal list-outside ps-6 my-3 space-y-1.5"
          >
            {children}
          </ol>
        ),
      },
      li: {
        component: ({ children, ...props }: React.ComponentProps<'li'>) => (
          <li {...props} className="leading-tight">
            {children}
          </li>
        ),
      },
      pre: {
        component: ({ children, ...props }: React.ComponentProps<'pre'>) => (
          <pre
            {...props}
            className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm bg-muted/50 rounded-sm p-2 my-2"
          >
            {children}
          </pre>
        ),
      },
    }),
    [imageOverride]
  );

  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await writeClipboardViaBridge(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 400);
    } catch {
      // noop – bridge handles fallback
    }
  }, [content]);

  return (
    <div className={`relative group`}>
      {enableCopyButton && (
        <div className="sticky top-2 right-2 z-10 pointer-events-none h-0">
          <div className="flex justify-end pr-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Button
                      type="button"
                      aria-label={copied ? 'Copied!' : 'Copy as Markdown'}
                      title={copied ? 'Copied!' : 'Copy as Markdown'}
                      variant="outline"
                      size="icon"
                      onClick={handleCopy}
                      className="pointer-events-auto opacity-0 group-hover:opacity-100 delay-0 transition-opacity duration-50 h-8 w-8 rounded-md bg-background/95 backdrop-blur border border-border shadow-sm"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Clipboard className="h-4 w-4" />
                      )}
                    </Button>
                    {copied && (
                      <div
                        className="absolute -right-1 mt-1 translate-y-1.5 select-none text-[11px] leading-none px-2 py-1 rounded bg-green-600 text-white shadow pointer-events-none"
                        role="status"
                        aria-live="polite"
                      >
                        Copied
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {copied ? 'Copied!' : 'Copy as Markdown'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}
      <div className={className}>
        <Markdown options={{ overrides, disableParsingRawHTML: true }}>
          {content}
        </Markdown>
      </div>
    </div>
  );
}

export default memo(MarkdownRenderer);
