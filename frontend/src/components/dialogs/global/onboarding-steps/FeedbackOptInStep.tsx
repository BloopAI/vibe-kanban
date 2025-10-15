import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle, XCircle, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type FeedbackOptInStepProps = {
  analyticsEnabled: boolean;
  isGitHubAuthenticated: boolean;
  onAnalyticsChange: (enabled: boolean) => void;
};

/**
 * FeedbackOptInStep - Step 2 of the unified onboarding flow
 *
 * Allows users to opt in or out of anonymous usage data collection and telemetry.
 * The checkbox is enabled by default to encourage users to help improve the product.
 *
 * Features:
 * - Clear explanation of what data is collected
 * - Transparency about GitHub profile usage (context-aware based on auth status)
 * - Explicit statement of what is NOT collected
 * - Reminder that settings can be changed later
 *
 * @param analyticsEnabled - Current analytics opt-in status
 * @param isGitHubAuthenticated - Whether user is signed in with GitHub
 * @param onAnalyticsChange - Callback when analytics preference changes
 */
export function FeedbackOptInStep({
  analyticsEnabled,
  isGitHubAuthenticated,
  onAnalyticsChange,
}: FeedbackOptInStepProps) {
  const { t } = useTranslation('common');

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="analytics"
            checked={analyticsEnabled}
            onCheckedChange={(checked) => onAnalyticsChange(!!checked)}
          />
          <div className="grid gap-1.5 leading-none">
            <label
              htmlFor="analytics"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {t('onboarding.feedback.optInLabel')}
            </label>
            <p className="text-sm text-muted-foreground">
              {t('onboarding.feedback.optInHelper')}
            </p>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <p className="font-medium">
            {t('onboarding.feedback.whatWeCollect')}
          </p>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>
                {t('onboarding.feedback.collectGitHub')}
                {!isGitHubAuthenticated && (
                  <span className="text-muted-foreground">
                    {' '}
                    {t('onboarding.feedback.whenSignedIn')}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>{t('onboarding.feedback.collectUsage')}</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>{t('onboarding.feedback.collectPerformance')}</span>
            </div>
            <div className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <span>{t('onboarding.feedback.doNotCollect')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <Settings className="h-4 w-4 flex-shrink-0" />
          <span>{t('onboarding.feedback.settingsNote')}</span>
        </div>
      </div>
    </div>
  );
}
