import { useCallback } from 'react';
import { NoteBlankIcon } from '@phosphor-icons/react';
import { IconListItem } from '@/components/ui-new/primitives/IconListItem';
import { CreateRepoDialog } from '@/components/ui-new/dialogs/CreateRepoDialog';
import type { Repo } from 'shared/types';

interface CreateRepoButtonContainerProps {
  onRepoCreated: (repo: Repo) => void;
}

export function CreateRepoButtonContainer({
  onRepoCreated,
}: CreateRepoButtonContainerProps) {
  const handleClick = useCallback(async () => {
    const repo = await CreateRepoDialog.show();
    if (repo) {
      onRepoCreated(repo);
    }
  }, [onRepoCreated]);

  return (
    <IconListItem
      icon={NoteBlankIcon}
      label="Create new repo on disk"
      onClick={handleClick}
    />
  );
}
