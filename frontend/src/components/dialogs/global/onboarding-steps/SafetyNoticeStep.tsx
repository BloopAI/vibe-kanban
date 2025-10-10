import { useTranslation } from 'react-i18next';

/**
 * SafetyNoticeStep - Step 4 of the unified onboarding flow
 *
 * Displays critical safety information about AI coding agents running with unrestricted
 * permissions. This is a mandatory acknowledgment step that users must read and accept
 * before using the application.
 *
 * Features:
 * - Clear warning about --dangerously-skip-permissions / --yolo flags
 * - Reminder to review agent actions and backup important work
 * - Link to comprehensive safety documentation
 * - No interactive elements - pure informational display
 *
 * This component has no props as it displays static safety information.
 */
export function SafetyNoticeStep() {
  const { t } = useTranslation('common');

  return (
    <div className="space-y-4">
      <div className="space-y-3 text-sm">
        <p>
          {t('onboarding.safetyNotice.warning1')}{' '}
          <code className="bg-muted px-1 py-0.5 rounded">
            {t('onboarding.safetyNotice.code1')}
          </code>{' '}
          {t('onboarding.safetyNotice.warning2')}{' '}
          <code className="bg-muted px-1 py-0.5 rounded">
            {t('onboarding.safetyNotice.code2')}
          </code>{' '}
          {t('onboarding.safetyNotice.warning3')}
        </p>
        <p>
          <strong>{t('onboarding.safetyNotice.important')}</strong>{' '}
          {t('onboarding.safetyNotice.importantText')}
        </p>
        <p>
          {t('onboarding.safetyNotice.learnMore')}{' '}
          <a
            href="https://www.vibekanban.com/docs/getting-started#safety-notice"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline hover:no-underline"
          >
            {t('onboarding.safetyNotice.docsLink')}
          </a>
        </p>
      </div>
    </div>
  );
}
