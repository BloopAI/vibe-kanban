import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Github } from 'lucide-react';
import { githubApi, RepositoryInfo } from '@/lib/api';

interface GitHubRepositoryPickerProps {
  selectedRepository: RepositoryInfo | null;
  onRepositorySelect: (repository: RepositoryInfo | null) => void;
  onNameChange: (name: string) => void;
  name: string;
  error: string;
}

// Simple in-memory cache for repositories
const repositoryCache = new Map<number, RepositoryInfo[]>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<number, number>();

function isCacheValid(page: number): boolean {
  const timestamp = cacheTimestamps.get(page);
  return timestamp ? Date.now() - timestamp < CACHE_DURATION : false;
}

export function GitHubRepositoryPicker({
  selectedRepository,
  onRepositorySelect,
  onNameChange,
  name,
  error,
}: GitHubRepositoryPickerProps) {
  const [repositories, setRepositories] = useState<RepositoryInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadRepositories = useCallback(
    async (pageNum: number = 1, isLoadingMore: boolean = false) => {
      if (isLoadingMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setLoadError('');

      try {
        // Check cache first
        if (isCacheValid(pageNum)) {
          const cachedRepos = repositoryCache.get(pageNum);
          if (cachedRepos) {
            if (pageNum === 1) {
              setRepositories(cachedRepos);
            } else {
              setRepositories((prev) => [...prev, ...cachedRepos]);
            }
            setPage(pageNum);
            return;
          }
        }

        const repos = await githubApi.listRepositories(pageNum);

        // Cache the results
        repositoryCache.set(pageNum, repos);
        cacheTimestamps.set(pageNum, Date.now());

        if (pageNum === 1) {
          setRepositories(repos);
        } else {
          setRepositories((prev) => [...prev, ...repos]);
        }
        setPage(pageNum);

        // If we got fewer than expected results, we've reached the end
        if (repos.length < 30) {
          // GitHub typically returns 30 repos per page
          setHasMorePages(false);
        }
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load repositories'
        );
      } finally {
        if (isLoadingMore) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    loadRepositories(1);
  }, [loadRepositories]);

  const handleRepositorySelect = (repository: RepositoryInfo) => {
    onRepositorySelect(repository);
    // Auto-populate project name from repository name if name is empty
    if (!name) {
      const cleanName = repository.name
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
      onNameChange(cleanName);
    }
  };

  const loadMoreRepositories = useCallback(() => {
    if (!loading && !loadingMore && hasMorePages) {
      loadRepositories(page + 1, true);
    }
  }, [loading, loadingMore, hasMorePages, page, loadRepositories]);

  // Infinite scroll handler
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      const isNearBottom = scrollHeight - scrollTop <= clientHeight + 100; // 100px threshold

      if (isNearBottom && !loading && !loadingMore && hasMorePages) {
        loadMoreRepositories();
      }
    },
    [loading, loadingMore, hasMorePages, loadMoreRepositories]
  );

  if (loadError) {
    return (
      <Alert>
        <AlertDescription>
          {loadError}
          <Button
            variant="link"
            className="h-auto p-0 ml-2"
            onClick={() => loadRepositories(1)}
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Select Repository</Label>
        {loading && repositories.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading repositories...</span>
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            className="max-h-64 overflow-y-auto border rounded-md p-4 space-y-3"
            onScroll={handleScroll}
          >
            {repositories.map((repository) => (
              <div
                key={repository.id}
                className={`p-3 border rounded-lg cursor-pointer hover:bg-accent ${
                  selectedRepository?.id === repository.id
                    ? 'bg-accent border-primary'
                    : ''
                }`}
                onClick={() => handleRepositorySelect(repository)}
              >
                <div className="flex items-start space-x-3">
                  <Github className="h-4 w-4 mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{repository.name}</span>
                      {repository.private && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                          Private
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <div>{repository.full_name}</div>
                      {repository.description && (
                        <div className="mt-1">{repository.description}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {repositories.length === 0 && !loading && (
              <div className="text-center py-4 text-muted-foreground">
                No repositories found
              </div>
            )}

            {/* Loading more indicator */}
            {loadingMore && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">
                  Loading more repositories...
                </span>
              </div>
            )}

            {/* Manual load more button (fallback if infinite scroll doesn't work) */}
            {hasMorePages && !loadingMore && repositories.length > 0 && (
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={loadMoreRepositories}
                  disabled={loading || loadingMore}
                  className="w-full"
                >
                  Load more repositories
                </Button>
              </div>
            )}

            {/* End of results indicator */}
            {!hasMorePages && repositories.length > 0 && (
              <div className="text-center py-2 text-xs text-muted-foreground border-t">
                All repositories loaded
              </div>
            )}
          </div>
        )}
      </div>

      {selectedRepository && (
        <div className="space-y-2">
          <Label htmlFor="project-name">Project Name</Label>
          <Input
            id="project-name"
            placeholder="Enter project name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
      )}

      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
