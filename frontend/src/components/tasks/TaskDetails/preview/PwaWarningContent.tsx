import { ExternalLink, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface PwaWarningContentProps {
  url: string;
}

export function PwaWarningContent({ url }: PwaWarningContentProps) {
  const { t } = useTranslation('tasks');

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-3">
            <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-500" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">
            {t('preview.pwaWarning.title')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('preview.pwaWarning.description')}
          </p>
        </div>
        <Button asChild size="lg" className="gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            {t('preview.pwaWarning.openInBrowser')}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          {url}
        </p>
      </div>
    </div>
  );
}
