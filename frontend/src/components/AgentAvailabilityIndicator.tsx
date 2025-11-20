import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentAvailabilityState } from '@/hooks/useAgentAvailability';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AgentAvailabilityIndicatorProps {
  availability: AgentAvailabilityState;
}

export function AgentAvailabilityIndicator({
  availability,
}: AgentAvailabilityIndicatorProps) {
  const { t } = useTranslation('settings');

  if (!availability) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 text-sm">
        {availability.status === 'checking' && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">
              {t('settings.agents.availability.checking')}
            </span>
          </>
        )}
        {availability.status === 'login_detected' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 cursor-help">
                <Check className="h-4 w-4 text-success" />
                <span className="text-success">
                  {t('settings.agents.availability.loginDetected')}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="z-[10000]">
              <p>{t('settings.agents.availability.loginDetectedTooltip')}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {availability.status === 'installation_found' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 cursor-help">
                <Check className="h-4 w-4 text-success" />
                <span className="text-success">
                  {t('settings.agents.availability.installationFound')}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="z-[10000]">
              <p>
                {t('settings.agents.availability.installationFoundTooltip')}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        {availability.status === 'not_found' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 cursor-help">
                <AlertCircle className="h-4 w-4 text-warning" />
                <span className="text-warning">
                  {t('settings.agents.availability.notFound')}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="z-[10000]">
              <p>{t('settings.agents.availability.notFoundTooltip')}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
