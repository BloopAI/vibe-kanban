import { useMemo, useState, type Dispatch } from 'react';

import { DirectoryPicker } from '@/components/directory-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, ArrowLeft, Folder } from 'lucide-react';
import { CreateProject } from 'shared/types';

import { fileSystemApi } from '@/lib/api';

import { type NewView, type ProjectFormEvent } from './project-form-reducer';

interface NewProjectPanelProps {
  view: NewView;
  dispatch: Dispatch<ProjectFormEvent>;
  isSubmitting: boolean;
}

export function NewProjectPanel({
  view,
  dispatch,
  isSubmitting,
}: NewProjectPanelProps) {
  if (view.status === 'hidden') {
    return null;
  }

  const [name, setName] = useState('');
  const [parentPath, setParentPath] = useState('');

  const slug = useMemo(() => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return '';
    return trimmed.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }, [name]);

  const finalName = name.trim();
  const finalRepoPath = useMemo(() => {
    if (!slug) return '';
    const base = parentPath.trim();
    if (!base) return slug;
    const normalizedBase = base
      .replace(/\\/g, '/')
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '');
    return `${normalizedBase}/${slug}`.replace(/\/{2,}/g, '/');
  }, [parentPath, slug]);

  const handleSubmit = () => {
    if (!finalName || !finalRepoPath) return;

    const payload: CreateProject = {
      name: finalName,
      git_repo_path: finalRepoPath,
      use_existing_repo: false,
      setup_script: null,
      dev_script: null,
      cleanup_script: null,
      copy_files: null,
    };

    dispatch({ type: 'SUBMIT', payload });
  };

  const errorMessage = view.error;

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => dispatch({ type: 'SET_MODE', mode: 'existing' })}
        className="flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to options
      </Button>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-project-name">
            Project Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="new-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My Awesome Project"
            className="placeholder:text-secondary-foreground placeholder:opacity-100"
            required
          />
          <p className="text-xs text-muted-foreground">
            Folder name will be derived automatically.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="parent-path">Parent Directory</Label>
          <DirectoryPicker.Root
            value={parentPath}
            onValueChange={setParentPath}
            startPath={parentPath || undefined}
            onResolveChildren={fileSystemApi.list}
            canSelectEntry={(entry) => entry.is_directory}
            onSubmit={(selectedPath) => setParentPath(selectedPath)}
          >
            <div className="flex space-x-2">
              <Input
                id="parent-path"
                value={parentPath}
                onChange={(event) => setParentPath(event.target.value)}
                placeholder="Current Directory"
                className="flex-1 placeholder:text-secondary-foreground placeholder:opacity-100"
              />
              <DirectoryPicker.Trigger asChild>
                <Button type="button" variant="ghost" size="icon">
                  <Folder className="h-4 w-4" />
                </Button>
              </DirectoryPicker.Trigger>
            </div>
            <DirectoryPicker.Portal>
              <DirectoryPicker.Overlay />
              <DirectoryPicker.Content>
                <DirectoryPicker.Title>
                  Select Parent Directory
                </DirectoryPicker.Title>
                <DirectoryPicker.Description>
                  Choose where to create the new repository
                </DirectoryPicker.Description>
                <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Enter path manually:
                    </div>
                    <div className="flex space-x-2 min-w-0">
                      <DirectoryPicker.PathInput className="flex-1 min-w-0" />
                      <DirectoryPicker.GoButton>Go</DirectoryPicker.GoButton>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Search current directory:
                    </div>
                    <DirectoryPicker.Search />
                  </div>

                  <DirectoryPicker.Toolbar>
                    <DirectoryPicker.HomeButton />
                    <DirectoryPicker.UpButton />
                    <DirectoryPicker.CurrentPath />
                    <DirectoryPicker.SelectCurrent>
                      Select Current
                    </DirectoryPicker.SelectCurrent>
                  </DirectoryPicker.Toolbar>

                  <DirectoryPicker.View>
                    <DirectoryPicker.List />
                  </DirectoryPicker.View>
                </div>

                <DirectoryPicker.Footer>
                  <DirectoryPicker.Cancel>Cancel</DirectoryPicker.Cancel>
                  <DirectoryPicker.Submit disabled={isSubmitting}>
                    {isSubmitting ? 'Creating...' : 'Select Path'}
                  </DirectoryPicker.Submit>
                </DirectoryPicker.Footer>
              </DirectoryPicker.Content>
            </DirectoryPicker.Portal>
          </DirectoryPicker.Root>
          <p className="text-xs text-muted-foreground">
            Leave empty to use your current working directory, or provide a
            custom path.
          </p>
        </div>
      </div>

      <div className="pt-2">
        <Button
          type="button"
          className="w-full"
          onClick={handleSubmit}
          disabled={!finalName || !slug || isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create Project'}
        </Button>
      </div>
    </div>
  );
}
