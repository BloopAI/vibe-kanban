import { useMemo, type Dispatch } from 'react';

import { DirectoryPicker } from '@/components/directory-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  ArrowLeft,
  FolderGit,
  FolderPlus,
  Search,
} from 'lucide-react';
import { DirectoryEntry, CreateProject } from 'shared/types';

import { generateProjectNameFromPath } from '@/utils/string';
import { fileSystemApi } from '@/lib/api';

import {
  LIST_WINDOW_INCREMENT,
  type ExistingView,
  type ProjectFormEvent,
} from './project-form-reducer';

interface ExistingRepoPanelProps {
  view: ExistingView;
  dispatch: Dispatch<ProjectFormEvent>;
  isSubmitting: boolean;
}

export function ExistingRepoPanel({
  view,
  dispatch,
  isSubmitting,
}: ExistingRepoPanelProps) {
  if (view.status === 'hidden') {
    return null;
  }

  const entries: DirectoryEntry[] =
    view.status === 'listed' ? view.entries : [];
  const visibleEntries = useMemo<DirectoryEntry[]>(() => {
    if (view.status !== 'listed') return [];
    return view.entries.slice(0, view.window);
  }, [view]);

  const isListing = view.status === 'listing';
  const errorMessage = view.error;

  const handleSelectRepo = (path: string) => {
    const payload: CreateProject = {
      name: generateProjectNameFromPath(path),
      git_repo_path: path,
      use_existing_repo: true,
      setup_script: null,
      dev_script: null,
      cleanup_script: null,
      copy_files: null,
    };

    dispatch({ type: 'SUBMIT', payload });
  };

  const showInitialCards = view.status === 'choosingSource';

  const showList = view.status === 'listed';

  return (
    <div className="space-y-4">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {showInitialCards && (
        <>
          <div
            className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
            onClick={() => dispatch({ type: 'LIST_REQUEST' })}
          >
            <div className="flex items-start gap-3">
              <FolderGit className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground">
                  From Git Repository
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Use an existing repository as your project base
                </div>
              </div>
            </div>
          </div>

          <div
            className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
            onClick={() => dispatch({ type: 'SET_MODE', mode: 'new' })}
          >
            <div className="flex items-start gap-3">
              <FolderPlus className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground">
                  Create Blank Project
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Start a new project from scratch
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {view.status === 'listed' && (
        <button
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => dispatch({ type: 'OPEN_EXISTING' })}
        >
          <ArrowLeft className="h-3 w-3" /> Back to options
        </button>
      )}

      {isListing && (
        <div className="p-4 border rounded-lg bg-card">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-muted-foreground border-t-transparent rounded-full" />
            <div className="text-sm text-muted-foreground">
              Loading repositories...
            </div>
          </div>
        </div>
      )}

      {showList && (
        <div className="space-y-4">
          <div className="space-y-2">
            {visibleEntries.map((repo) => (
              <div
                key={repo.path}
                className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                onClick={() => handleSelectRepo(repo.path)}
              >
                <div className="flex items-start gap-3">
                  <FolderGit className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">
                      {repo.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-1">
                      {repo.path}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {entries.length > visibleEntries.length && (
              <button
                className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
                onClick={() => dispatch({ type: 'EXPAND_WINDOW' })}
              >
                Show{' '}
                {Math.min(
                  entries.length - visibleEntries.length,
                  LIST_WINDOW_INCREMENT
                )}{' '}
                more repositories
              </button>
            )}
          </div>

          <DirectoryPicker.Root
            onResolveChildren={fileSystemApi.list}
            canSelectEntry={(entry) => entry.is_directory && entry.is_git_repo}
            onSubmit={(path) => handleSelectRepo(path)}
          >
            <DirectoryPicker.Trigger asChild>
              <div className="p-4 border border-dashed cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card">
                <div className="flex items-start gap-3">
                  <Search className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">
                      Search all repos
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Browse and select any repository on your system
                    </div>
                  </div>
                </div>
              </div>
            </DirectoryPicker.Trigger>
            <DirectoryPicker.Portal>
              <DirectoryPicker.Overlay />
              <DirectoryPicker.Content>
                <DirectoryPicker.Title>
                  Select Git Repository
                </DirectoryPicker.Title>
                <DirectoryPicker.Description>
                  Choose an existing git repository
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
                    {isSubmitting ? 'Creating...' : 'Select Repository'}
                  </DirectoryPicker.Submit>
                </DirectoryPicker.Footer>
              </DirectoryPicker.Content>
            </DirectoryPicker.Portal>
          </DirectoryPicker.Root>
        </div>
      )}
    </div>
  );
}
