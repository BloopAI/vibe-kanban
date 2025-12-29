import { useState, useCallback } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { repoApi } from '@/lib/api';
import { FolderPickerDialog } from '@/components/dialogs/shared/FolderPickerDialog';
import { IconListItem } from '@/components/ui-new/primitives/IconListItem';
import type { Repo } from 'shared/types';

interface BrowseRepoButtonContainerProps {
  disabled?: boolean;
  onRepoRegistered: (repo: Repo) => void;
}

export function BrowseRepoButtonContainer({
  disabled,
  onRepoRegistered,
}: BrowseRepoButtonContainerProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = useCallback(async () => {
    const selectedPath = await FolderPickerDialog.show({
      title: 'Select Git Repository',
      description: 'Choose an existing git repository',
    });

    if (selectedPath) {
      setIsRegistering(true);
      setError(null);
      try {
        const repo = await repoApi.register({ path: selectedPath });
        onRepoRegistered(repo);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to register repository';
        setError(message);
      } finally {
        setIsRegistering(false);
      }
    }
  }, [onRepoRegistered]);

  return (
    <>
      <IconListItem
        icon={MagnifyingGlassIcon}
        label="Browse repos on disk"
        onClick={handleBrowse}
        disabled={disabled}
        loading={isRegistering}
      />
      {error && <p className="text-xs text-error px-base">{error}</p>}
    </>
  );
}
