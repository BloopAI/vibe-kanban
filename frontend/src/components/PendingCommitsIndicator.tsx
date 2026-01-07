import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { GitCommit } from 'lucide-react';
import { usePendingCommitsCount } from '@/hooks';
import { PendingCommitsDialog } from '@/components/dialogs/git/PendingCommitsDialog';

export function PendingCommitsIndicator() {
  const { t } = useTranslation('pendingCommits');
  const { data: count } = usePendingCommitsCount();

  // no renderiza nada si no hay pending commits
  if (!count || count === 0) {
    return null;
  }

  const handleClick = () => {
    PendingCommitsDialog.show({});
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 relative"
            onClick={handleClick}
            aria-label={t('indicator.ariaLabel', { count })}
          >
            <GitCommit className="h-4 w-4" />
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center text-xs"
            >
              {count > 99 ? '99+' : count}
            </Badge>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t('indicator.tooltip', { count })}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
