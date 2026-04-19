import { useCallback, useEffect, useState } from 'react';
import { Check, Clipboard } from 'lucide-react';
import { Button } from '@vibe/ui/components/Button';
import { writeClipboardViaBridge } from '@/shared/lib/clipboard';
import { cn } from '@/shared/lib/utils';

interface CodeBlockCopyButtonProps {
  text: string;
  className?: string;
}

export function CodeBlockCopyButton({
  text,
  className,
}: CodeBlockCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    if (!text) return;
    await writeClipboardViaBridge(text);
    setCopied(true);
  }, [text]);

  return (
    <Button
      type="button"
      aria-label={copied ? 'Copied' : 'Copy code'}
      title={copied ? 'Copied' : 'Copy code'}
      variant="icon"
      size="icon"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleCopy();
      }}
      className={cn(
        'pointer-events-auto h-8 w-8 rounded-md border border-border/70 bg-panel/95 p-2 shadow-sm backdrop-blur-sm transition-opacity',
        className
      )}
    >
      {copied ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <Clipboard className="h-4 w-4 text-low" />
      )}
    </Button>
  );
}
