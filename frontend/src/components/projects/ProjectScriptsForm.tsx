import { useTranslation, Trans } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { CopyFilesField } from './copy-files-field';

interface ProjectScriptsFormProps {
  setupScript: string;
  setSetupScript: (script: string) => void;
  devScript: string;
  setDevScript: (script: string) => void;
  cleanupScript: string;
  setCleanupScript: (script: string) => void;
  copyFiles: string;
  setCopyFiles: (files: string) => void;
  placeholders: {
    setup: string;
    dev: string;
    cleanup: string;
  };
  projectId?: string;
}

/**
 * Shared form component for project scripts and copy files configuration.
 * Used in both ProjectSetupWizard and ProjectFormFields to maintain consistency
 * and avoid code duplication.
 */
export function ProjectScriptsForm({
  setupScript,
  setSetupScript,
  devScript,
  setDevScript,
  cleanupScript,
  setCleanupScript,
  copyFiles,
  setCopyFiles,
  placeholders,
  projectId,
}: ProjectScriptsFormProps) {
  const { t } = useTranslation('projects');

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="setup-script">{t('setup.setupScript.label')}</Label>
        <textarea
          id="setup-script"
          value={setupScript}
          onChange={(e) => setSetupScript(e.target.value)}
          placeholder={placeholders.setup}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-sm text-muted-foreground">
          {t('setup.setupScript.help')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dev-script">{t('setup.devScript.label')}</Label>
        <textarea
          id="dev-script"
          value={devScript}
          onChange={(e) => setDevScript(e.target.value)}
          placeholder={placeholders.dev}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-sm text-muted-foreground">
          {t('setup.devScript.help')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cleanup-script">{t('setup.cleanupScript.label')}</Label>
        <textarea
          id="cleanup-script"
          value={cleanupScript}
          onChange={(e) => setCleanupScript(e.target.value)}
          placeholder={placeholders.cleanup}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-sm text-muted-foreground">
          <Trans i18nKey="setup.cleanupScript.help" t={t}>
            This script runs after coding agent execution{' '}
            <strong>only if changes were made</strong>. Use it for quality
            assurance tasks like running linters, formatters, tests, or other
            validation steps. If no changes are made, this script is skipped.
          </Trans>
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t('setup.copyFiles.label')}</Label>
        <CopyFilesField
          value={copyFiles}
          onChange={setCopyFiles}
          projectId={projectId}
        />
        <p className="text-sm text-muted-foreground">
          {t('setup.copyFiles.help')}
        </p>
      </div>
    </div>
  );
}
