import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Shield, CheckCircle, XCircle, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfig } from '@/components/config-provider';
import { useTranslation } from '@/lib/i18n';

interface PrivacyOptInDialogProps {
  open: boolean;
  onComplete: (telemetryEnabled: boolean) => void;
}

export function PrivacyOptInDialog({
  open,
  onComplete,
}: PrivacyOptInDialogProps) {
  const { config } = useConfig();
  const { t } = useTranslation();

  // Check if user is authenticated with GitHub
  const isGitHubAuthenticated =
    config?.github?.username && config?.github?.oauth_token;

  const handleOptIn = () => {
    onComplete(true);
  };

  const handleOptOut = () => {
    onComplete(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <DialogTitle>{t('privacyOptIn.title')}</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-1">
            {t('privacyOptIn.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t('privacyOptIn.whatDataCollect')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {isGitHubAuthenticated && (
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {t('privacyOptIn.githubProfile')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('privacyOptIn.githubProfileDesc')}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t('privacyOptIn.usageMetrics')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('privacyOptIn.usageMetricsDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t('privacyOptIn.performanceData')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('privacyOptIn.performanceDataDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t('privacyOptIn.doNotCollect')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('privacyOptIn.doNotCollectDesc')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
            <Settings className="h-3 w-3 flex-shrink-0" />
            <span>
              {t('privacyOptIn.settingsNote')}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-3 flex-col sm:flex-row pt-2">
          <Button variant="outline" onClick={handleOptOut} className="flex-1">
            <XCircle className="h-4 w-4 mr-2" />
            {t('privacyOptIn.noThanks')}
          </Button>
          <Button onClick={handleOptIn} className="flex-1">
            <CheckCircle className="h-4 w-4 mr-2" />
            {t('privacyOptIn.yesHelp')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
