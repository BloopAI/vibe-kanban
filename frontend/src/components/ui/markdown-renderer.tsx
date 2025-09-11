import ReactMarkdown, { Components } from 'react-markdown';
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
  const components: Components = useMemo(
    () => ({
      code: ({ children, ...props }) => (
        <code
          {...props}
          className="bg-background px-1 py-0.5 text-sm font-mono"
        >
          {children}
        </code>
      ),
      strong: ({ children, ...props }) => (
        <span {...props} className="">
          {children}
        </span>
      ),
      em: ({ children, ...props }) => (
        <em {...props} className="italic">
          {children}
        </em>
      ),
      p: ({ children, ...props }) => (
        <p {...props} className="leading-tight">
          {children}
        </p>
      ),
      h1: ({ children, ...props }) => (
        <h1 {...props} className="text-lg leading-tight font-medium">
          {children}
        </h1>
      ),
      h2: ({ children, ...props }) => (
        <h2 {...props} className="text-baseleading-tight font-medium">
          {children}
        </h2>
      ),
      h3: ({ children, ...props }) => (
        <h3 {...props} className="text-sm leading-tight">
          {children}
        </h3>
      ),
      ul: ({ children, ...props }) => (
        <ul
          {...props}
          className="list-disc list-inside flex flex-col gap-1 pl-4"
        >
          {children}
        </ul>
      ),
      ol: ({ children, ...props }) => (
        <ol
          {...props}
          className="list-decimal list-inside flex flex-col gap-1 pl-4"
        >
          {children}
        </ol>
      ),
      li: ({ children, ...props }) => (
        <li {...props} className="leading-tight">
          {children}
        </li>
      ),
    }),
    []
  );

  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await writeClipboardViaBridge(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // noop – bridge handles fallback
    }
  }, [content]);

  return (
    <div className={`relative group`}>
      {enableCopyButton && (
        <div className="sticky top-2 z-10 pointer-events-none">
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
                      className="pointer-events-auto opacity-0 group-hover:opacity-100 group-hover:delay-200 delay-0 transition-opacity duration-150 h-8 w-8 rounded-md bg-background/95 backdrop-blur border border-border shadow-sm"
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
        <ReactMarkdown components={components}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

export default memo(MarkdownRenderer);
