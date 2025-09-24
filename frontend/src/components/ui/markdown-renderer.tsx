import Markdown from 'markdown-to-jsx';
import { memo, useMemo, useState, useCallback } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Check, Clipboard } from 'lucide-react';
import { writeClipboardViaBridge } from '@/vscode/bridge';

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

function InlineCodeOverride({ children, className, ...props }: any) {
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

interface MarkdownRendererProps {
  content: string;
  className?: string;
  enableCopyButton?: boolean;
}

function MarkdownRenderer({
  content,
  className = '',
  enableCopyButton = false,
}: MarkdownRendererProps) {
  const overrides = useMemo(
    () => ({
      a: { component: LinkOverride },
      code: { component: InlineCodeOverride },
      strong: {
        component: ({ children, ...props }: any) => (
          <span {...props} className="">
            {children}
          </span>
        ),
      },
      em: {
        component: ({ children, ...props }: any) => (
          <em {...props} className="italic">
            {children}
          </em>
        ),
      },
      p: {
        component: ({ children, ...props }: any) => (
          <p {...props} className="leading-tight">
            {children}
          </p>
        ),
      },
      h1: {
        component: ({ children, ...props }: any) => (
          <h1 {...props} className="text-lg leading-tight font-medium">
            {children}
          </h1>
        ),
      },
      h2: {
        component: ({ children, ...props }: any) => (
          <h2 {...props} className="text-baseleading-tight font-medium">
            {children}
          </h2>
        ),
      },
      h3: {
        component: ({ children, ...props }: any) => (
          <h3 {...props} className="text-sm leading-tight">
            {children}
          </h3>
        ),
      },
      ul: {
        component: ({ children, ...props }: any) => (
          <ul {...props} className="list-disc list-outside space-y-1 ps-6">
            {children}
          </ul>
        ),
      },
      ol: {
        component: ({ children, ...props }: any) => (
          <ol {...props} className="list-decimal list-outside space-y-1 ps-6">
            {children}
          </ol>
        ),
      },
      li: {
        component: ({ children, ...props }: any) => (
          <li {...props} className="leading-tight">
            {children}
          </li>
        ),
      },
    }),
    []
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
        <Markdown options={{ overrides }}>{content}</Markdown>
      </div>
    </div>
  );
}

export default memo(MarkdownRenderer);
