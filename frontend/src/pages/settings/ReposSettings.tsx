import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isEqual } from 'lodash';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useScriptPlaceholders } from '@/hooks/useScriptPlaceholders';
import { AutoExpandingTextarea } from '@/components/ui/auto-expanding-textarea';
import { MultiFileSearchTextarea } from '@/components/ui/multi-file-search-textarea';
import { repoApi } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Repo, UpdateRepo } from 'shared/types';

interface RepoScriptsFormState {
  display_name: string;
  setup_script: string;
  parallel_setup_script: boolean;
  cleanup_script: string;
  copy_files: string;
  dev_server_script: string;
}

function repoToFormState(repo: Repo): RepoScriptsFormState {
  return {
    display_name: repo.display_name,
    setup_script: repo.setup_script ?? '',
    parallel_setup_script: repo.parallel_setup_script,
    cleanup_script: repo.cleanup_script ?? '',
    copy_files: repo.copy_files ?? '',
    dev_server_script: repo.dev_server_script ?? '',
  };
}

export function ReposSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const repoIdParam = searchParams.get('repoId') ?? '';
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();

  // Fetch all repos
  const {
    data: repos,
    isLoading: reposLoading,
    error: reposError,
  } = useQuery({
    queryKey: ['repos'],
    queryFn: () => repoApi.list(),
  });

  // Selected repo state
  const [selectedRepoId, setSelectedRepoId] = useState<string>(repoIdParam);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);

  // Form state
  const [draft, setDraft] = useState<RepoScriptsFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Get OS-appropriate script placeholders
  const placeholders = useScriptPlaceholders();

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !selectedRepo) return false;
    return !isEqual(draft, repoToFormState(selectedRepo));
  }, [draft, selectedRepo]);

  // Handle repo selection from dropdown
  const handleRepoSelect = useCallback(
    (id: string) => {
      if (id === selectedRepoId) return;

      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          t('settings.repos.save.confirmSwitch')
        );
        if (!confirmed) return;
        setDraft(null);
        setSelectedRepo(null);
        setSuccess(false);
        setError(null);
      }

      setSelectedRepoId(id);
      if (id) {
        setSearchParams({ repoId: id });
      } else {
        setSearchParams({});
      }
    },
    [hasUnsavedChanges, selectedRepoId, setSearchParams, t]
  );

  // Sync selectedRepoId when URL changes
  useEffect(() => {
    if (repoIdParam === selectedRepoId) return;

    if (hasUnsavedChanges) {
      const confirmed = window.confirm(t('settings.repos.save.confirmSwitch'));
      if (!confirmed) {
        if (selectedRepoId) {
          setSearchParams({ repoId: selectedRepoId });
        } else {
          setSearchParams({});
        }
        return;
      }
      setDraft(null);
      setSelectedRepo(null);
      setSuccess(false);
      setError(null);
    }

    setSelectedRepoId(repoIdParam);
  }, [repoIdParam, hasUnsavedChanges, selectedRepoId, setSearchParams, t]);

  // Populate draft from server data
  useEffect(() => {
    if (!repos) return;

    const nextRepo = selectedRepoId
      ? repos.find((r) => r.id === selectedRepoId)
      : null;

    setSelectedRepo((prev) =>
      prev?.id === nextRepo?.id ? prev : (nextRepo ?? null)
    );

    if (!nextRepo) {
      if (!hasUnsavedChanges) setDraft(null);
      return;
    }

    if (hasUnsavedChanges) return;

    setDraft(repoToFormState(nextRepo));
  }, [repos, selectedRepoId, hasUnsavedChanges]);

  // Warn on tab close/navigation with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const handleSave = async () => {
    if (!draft || !selectedRepo) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updateData: UpdateRepo = {
        display_name: draft.display_name.trim() || null,
        setup_script: draft.setup_script.trim() || null,
        cleanup_script: draft.cleanup_script.trim() || null,
        copy_files: draft.copy_files.trim() || null,
        parallel_setup_script: draft.parallel_setup_script,
        dev_server_script: draft.dev_server_script.trim() || null,
      };

      const updatedRepo = await repoApi.update(selectedRepo.id, updateData);
      setSelectedRepo(updatedRepo);
      setDraft(repoToFormState(updatedRepo));
      queryClient.setQueryData(['repos'], (old: Repo[] | undefined) =>
        old?.map((r) => (r.id === updatedRepo.id ? updatedRepo : r))
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('settings.repos.save.error')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!selectedRepo) return;
    setDraft(repoToFormState(selectedRepo));
  };

  const updateDraft = (updates: Partial<RepoScriptsFormState>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, ...updates };
    });
  };

  if (reposLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">{t('settings.repos.loading')}</span>
      </div>
    );
  }

  if (reposError) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertDescription>
            {reposError instanceof Error
              ? reposError.message
              : t('settings.repos.loadError')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <AlertDescription className="font-medium">
            {t('settings.repos.save.success')}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.repos.title')}</CardTitle>
          <CardDescription>{t('settings.repos.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repo-selector">
              {t('settings.repos.selector.label')}
            </Label>
            <Select value={selectedRepoId} onValueChange={handleRepoSelect}>
              <SelectTrigger id="repo-selector">
                <SelectValue
                  placeholder={t('settings.repos.selector.placeholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {repos && repos.length > 0 ? (
                  repos.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id}>
                      {repo.display_name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-repos" disabled>
                    {t('settings.repos.selector.noRepos')}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.repos.selector.helper')}
            </p>
          </div>
        </CardContent>
      </Card>

      {selectedRepo && draft && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.repos.general.title')}</CardTitle>
              <CardDescription>
                {t('settings.repos.general.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display-name">
                  {t('settings.repos.general.displayName.label')}
                </Label>
                <Input
                  id="display-name"
                  type="text"
                  value={draft.display_name}
                  onChange={(e) =>
                    updateDraft({ display_name: e.target.value })
                  }
                  placeholder={t(
                    'settings.repos.general.displayName.placeholder'
                  )}
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.repos.general.displayName.helper')}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t('settings.repos.general.path.label')}</Label>
                <div className="text-sm text-muted-foreground font-mono bg-muted px-3 py-2 rounded-md">
                  {selectedRepo.path}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.repos.scripts.title')}</CardTitle>
              <CardDescription>
                {t('settings.repos.scripts.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dev-server-script">
                  {t('settings.repos.scripts.devServer.label')}
                </Label>
                <AutoExpandingTextarea
                  id="dev-server-script"
                  value={draft.dev_server_script}
                  onChange={(e) =>
                    updateDraft({
                      dev_server_script: e.target.value,
                    })
                  }
                  placeholder={placeholders.dev}
                  maxRows={12}
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.repos.scripts.devServer.helper')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="setup-script">
                  {t('settings.repos.scripts.setup.label')}
                </Label>
                <AutoExpandingTextarea
                  id="setup-script"
                  value={draft.setup_script}
                  onChange={(e) =>
                    updateDraft({ setup_script: e.target.value })
                  }
                  placeholder={placeholders.setup}
                  maxRows={12}
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.repos.scripts.setup.helper')}
                </p>

                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="parallel-setup-script"
                    checked={draft.parallel_setup_script}
                    onCheckedChange={(checked) =>
                      updateDraft({
                        parallel_setup_script: checked === true,
                      })
                    }
                    disabled={!draft.setup_script.trim()}
                  />
                  <Label
                    htmlFor="parallel-setup-script"
                    className="text-sm font-normal cursor-pointer"
                  >
                    {t('settings.repos.scripts.setup.parallelLabel')}
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground pl-6">
                  {t('settings.repos.scripts.setup.parallelHelper')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cleanup-script">
                  {t('settings.repos.scripts.cleanup.label')}
                </Label>
                <AutoExpandingTextarea
                  id="cleanup-script"
                  value={draft.cleanup_script}
                  onChange={(e) =>
                    updateDraft({
                      cleanup_script: e.target.value,
                    })
                  }
                  placeholder={placeholders.cleanup}
                  maxRows={12}
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.repos.scripts.cleanup.helper')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="copy-files">
                  {t('settings.repos.scripts.copyFiles.label')}
                </Label>
                <MultiFileSearchTextarea
                  value={draft.copy_files}
                  onChange={(value) => updateDraft({ copy_files: value })}
                  placeholder={t(
                    'settings.repos.scripts.copyFiles.placeholder'
                  )}
                  maxRows={6}
                  repoId={selectedRepo.id}
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.repos.scripts.copyFiles.helper')}
                </p>
              </div>

              {/* Save Buttons */}
              <div className="flex items-center justify-between pt-4 border-t">
                {hasUnsavedChanges ? (
                  <span className="text-sm text-muted-foreground">
                    {t('settings.repos.save.unsavedChanges')}
                  </span>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDiscard}
                    disabled={!hasUnsavedChanges || saving}
                  >
                    {t('settings.repos.save.discard')}
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!hasUnsavedChanges || saving}
                  >
                    {saving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('settings.repos.save.button')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
