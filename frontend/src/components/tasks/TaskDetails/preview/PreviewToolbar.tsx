import { ExternalLink, RefreshCw, Copy, Loader2, Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { NewCardHeader } from '@/components/ui/new-card';

interface PreviewToolbarProps {
  mode: 'noServer' | 'error' | 'ready';
  url?: string;
  onRefresh: () => void;
  onCopyUrl: () => void;
  onStop: () => void;
  isStopping?: boolean;
}

export function PreviewToolbar({
  mode,
  url,
  onRefresh,
  onCopyUrl,
  onStop,
  isStopping,
}: PreviewToolbarProps) {
  const { t } = useTranslation('tasks');

  const actions =
    mode !== 'noServer' ? (
      <>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                aria-label={t('preview.toolbar.refresh')}
                onClick={onRefresh}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('preview.toolbar.refresh')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                aria-label={t('preview.toolbar.copyUrl')}
                onClick={onCopyUrl}
                disabled={!url}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('preview.toolbar.copyUrl')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                aria-label={t('preview.toolbar.openInTab')}
                asChild
                disabled={!url}
              >
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
            <TooltipContent side="bottom">
              {t('preview.toolbar.openInTab')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="h-4 w-px bg-border" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="icon"
                aria-label={t('preview.toolbar.stopDevServer')}
                onClick={onStop}
                disabled={isStopping}
              >
                {isStopping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('preview.toolbar.stopDevServer')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </>
    ) : undefined;

  return (
    <NewCardHeader className="shrink-0" actions={actions}>
      <div className="flex items-center">
        <span
          className="text-sm text-muted-foreground font-mono truncate whitespace-nowrap"
          aria-live="polite"
        >
          {url || <Loader2 className="h-4 w-4 animate-spin" />}
        </span>
      </div>
    </NewCardHeader>
  );
}
