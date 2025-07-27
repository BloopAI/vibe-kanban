import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Folder } from 'lucide-react';
import { useSystemInfo } from '@/hooks/use-system-info';
import {
  createScriptPlaceholderStrategy,
  ScriptPlaceholderContext,
} from '@/utils/script-placeholders';
import { useTranslation } from '@/lib/i18n';

interface ProjectFormFieldsProps {
  isEditing: boolean;
  repoMode: 'existing' | 'new';
  setRepoMode: (mode: 'existing' | 'new') => void;
  gitRepoPath: string;
  handleGitRepoPathChange: (path: string) => void;
  setShowFolderPicker: (show: boolean) => void;
  parentPath: string;
  setParentPath: (path: string) => void;
  folderName: string;
  setFolderName: (name: string) => void;
  setName: (name: string) => void;
  name: string;
  setupScript: string;
  setSetupScript: (script: string) => void;
  devScript: string;
  setDevScript: (script: string) => void;
  cleanupScript: string;
  setCleanupScript: (script: string) => void;
  error: string;
}

export function ProjectFormFields({
  isEditing,
  repoMode,
  setRepoMode,
  gitRepoPath,
  handleGitRepoPathChange,
  setShowFolderPicker,
  parentPath,
  setParentPath,
  folderName,
  setFolderName,
  setName,
  name,
  setupScript,
  setSetupScript,
  devScript,
  setDevScript,
  cleanupScript,
  setCleanupScript,
  error,
}: ProjectFormFieldsProps) {
  const { t } = useTranslation();
  const { systemInfo } = useSystemInfo();

  // Create strategy-based placeholders
  const placeholders = systemInfo
    ? new ScriptPlaceholderContext(
        createScriptPlaceholderStrategy(systemInfo.os_type)
      ).getPlaceholders()
    : {
        setup: '#!/bin/bash\nnpm install\n# Add any setup commands here...',
        dev: '#!/bin/bash\nnpm run dev\n# Add dev server start command here...',
        cleanup:
          '#!/bin/bash\n# Add cleanup commands here...\n# This runs after coding agent execution',
      };

  return (
    <>
      {!isEditing && (
        <div className="space-y-3">
          <Label>{t('projectCreation.repositoryType')}</Label>
          <div className="flex space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="repoMode"
                value="existing"
                checked={repoMode === 'existing'}
                onChange={(e) =>
                  setRepoMode(e.target.value as 'existing' | 'new')
                }
                className="text-primary"
              />
              <span className="text-sm">{t('projectCreation.useExistingRepo')}</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="repoMode"
                value="new"
                checked={repoMode === 'new'}
                onChange={(e) =>
                  setRepoMode(e.target.value as 'existing' | 'new')
                }
                className="text-primary"
              />
              <span className="text-sm">{t('projectCreation.createNewRepo')}</span>
            </label>
          </div>
        </div>
      )}

      {repoMode === 'existing' || isEditing ? (
        <div className="space-y-2">
          <Label htmlFor="git-repo-path">{t('projectCreation.gitRepoPath')}</Label>
          <div className="flex space-x-2">
            <Input
              id="git-repo-path"
              type="text"
              value={gitRepoPath}
              onChange={(e) => handleGitRepoPathChange(e.target.value)}
              placeholder={t('projectCreation.gitRepoPathPlaceholder')}
              required
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFolderPicker(true)}
            >
              <Folder className="h-4 w-4" />
            </Button>
          </div>
          {!isEditing && (
            <p className="text-sm text-muted-foreground">
              {t('projectCreation.selectFolderDescription')}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="parent-path">{t('projectCreation.parentDirectory')}</Label>
            <div className="flex space-x-2">
              <Input
                id="parent-path"
                type="text"
                value={parentPath}
                onChange={(e) => setParentPath(e.target.value)}
                placeholder={t('projectCreation.parentDirectoryPlaceholder')}
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFolderPicker(true)}
              >
                <Folder className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('projectCreation.chooseParentDescription')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="folder-name">{t('projectCreation.repositoryFolderName')}</Label>
            <Input
              id="folder-name"
              type="text"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                if (e.target.value) {
                  setName(
                    e.target.value
                      .replace(/[-_]/g, ' ')
                      .replace(/\b\w/g, (l) => l.toUpperCase())
                  );
                }
              }}
              placeholder={t('projectCreation.folderNamePlaceholder')}
              required
              className="flex-1"
            />
            <p className="text-sm text-muted-foreground">
              {t('projectCreation.folderNameDescription')}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">{t('projectCreation.projectName')}</Label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('projectCreation.projectNamePlaceholder')}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="setup-script">{t('projectCreation.setupScript')}</Label>
        <textarea
          id="setup-script"
          value={setupScript}
          onChange={(e) => setSetupScript(e.target.value)}
          placeholder={placeholders.setup}
          rows={4}
          className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-sm text-muted-foreground">
          {t('projectCreation.setupScriptDescription')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dev-script">{t('projectCreation.devServerScript')}</Label>
        <textarea
          id="dev-script"
          value={devScript}
          onChange={(e) => setDevScript(e.target.value)}
          placeholder={placeholders.dev}
          rows={4}
          className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-sm text-muted-foreground">
          {t('projectCreation.devServerScriptDescription')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cleanup-script">{t('projectCreation.cleanupScript')}</Label>
        <textarea
          id="cleanup-script"
          value={cleanupScript}
          onChange={(e) => setCleanupScript(e.target.value)}
          placeholder={placeholders.cleanup}
          rows={4}
          className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-sm text-muted-foreground">
          {t('projectCreation.cleanupScriptDescription')}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
