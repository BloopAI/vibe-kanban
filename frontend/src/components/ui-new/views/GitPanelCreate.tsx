import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/ui-new/primitives/SectionHeader';
import { CollapsibleSection } from '@/components/ui-new/primitives/CollapsibleSection';
import { SelectedReposList } from '@/components/ui-new/primitives/SelectedReposList';
import { RecentReposListContainer } from '@/components/ui-new/containers/RecentReposListContainer';
import { BrowseRepoButtonContainer } from '@/components/ui-new/containers/BrowseRepoButtonContainer';
import { CreateRepoButtonContainer } from '@/components/ui-new/containers/CreateRepoButtonContainer';
import type { Repo } from 'shared/types';

interface GitPanelCreateProps {
  className?: string;
}

export function GitPanelCreate({ className }: GitPanelCreateProps) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isAddExpanded, setIsAddExpanded] = useState(true);

  const addRepo = useCallback((repo: Repo) => {
    setRepos((prev) =>
      prev.some((r) => r.id === repo.id) ? prev : [...prev, repo]
    );
  }, []);

  const removeRepo = useCallback((repoId: string) => {
    setRepos((prev) => prev.filter((r) => r.id !== repoId));
  }, []);

  const registeredRepoPaths = useMemo(() => repos.map((r) => r.path), [repos]);

  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col gap-double pt-double px-double text-low overflow-y-auto',
        className
      )}
    >
      <SectionHeader title="Repositories" />

      <SelectedReposList repos={repos} onRemove={removeRepo} />

      <CollapsibleSection
        title="Add Repository"
        expanded={isAddExpanded}
        onToggle={() => setIsAddExpanded(!isAddExpanded)}
        className="gap-base"
      >
        <p className="text-xs text-low font-medium">Recent</p>
        <RecentReposListContainer
          registeredRepoPaths={registeredRepoPaths}
          onRepoRegistered={addRepo}
        />
        <p className="text-xs text-low font-medium">Other</p>
        <BrowseRepoButtonContainer onRepoRegistered={addRepo} />
        <CreateRepoButtonContainer onRepoCreated={addRepo} />
      </CollapsibleSection>
    </div>
  );
}
