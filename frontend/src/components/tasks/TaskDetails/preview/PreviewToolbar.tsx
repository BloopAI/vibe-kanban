import { ExternalLink, RefreshCw, Copy, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PreviewToolbarProps {
  mode: 'noServer' | 'error' | 'ready';
  url?: string;
  onRefresh: () => void;
  onCopyUrl: () => void;
}

export function PreviewToolbar({
  mode,
  url,
  onRefresh,
  onCopyUrl,
}: PreviewToolbarProps) {
  const { t } = useTranslation('tasks');
  return (
    <div className="flex items-center gap-2 p-3 border-b bg-muted/50 shrink-0">
      <span className="text-sm text-muted-foreground font-mono truncate flex-1">
        {url || <Loader2 className="animate-spin" />}
      </span>

      {mode !== 'noServer' && (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={onRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('preview.toolbar.refresh')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCopyUrl}
                  disabled={!url}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('preview.toolbar.copyUrl')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" asChild disabled={!url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('preview.toolbar.openInTab')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
    </div>
  );
}
