import { FolderSimpleStarIcon, SpinnerIcon } from '@phosphor-icons/react';
import { IconListItem } from './IconListItem';

export interface RecentRepoEntry {
  path: string;
  name: string;
  isRegistering: boolean;
}

interface RecentReposListProps {
  repos: RecentRepoEntry[];
  loading: boolean;
  error: string | null;
  onSelect: (entry: RecentRepoEntry) => void;
}

export function RecentReposList({
  repos,
  loading,
  error,
  onSelect,
}: RecentReposListProps) {
  return (
    <div className="flex flex-col gap-half">
      {loading && (
        <div className="flex items-center gap-base py-base">
          <SpinnerIcon className="size-icon-sm text-low animate-spin" />
          <span className="text-sm text-low">Loading repositories...</span>
        </div>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
      {!loading && repos.length === 0 && !error && (
        <p className="text-xs text-low py-half">No recent repositories found</p>
      )}
      {!loading &&
        repos.map((entry) => (
          <IconListItem
            key={entry.path}
            icon={FolderSimpleStarIcon}
            label={entry.name}
            onClick={() => onSelect(entry)}
            disabled={entry.isRegistering}
            loading={entry.isRegistering}
          />
        ))}
    </div>
  );
}
