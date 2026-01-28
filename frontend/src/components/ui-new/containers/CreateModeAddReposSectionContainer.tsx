import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranchIcon } from '@phosphor-icons/react';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { CloneRepoDialog } from '@/components/dialogs/shared/CloneRepoDialog';
import { IconListItem } from '@/components/ui-new/primitives/IconListItem';

export function CreateModeAddReposSectionContainer() {
  const { t } = useTranslation(['common']);
  const { addRepo } = useCreateMode();

  const handleCloneRepo = useCallback(async () => {
    const repo = await CloneRepoDialog.show({
      title: t('common:dialogs.cloneRepo.title'),
      description: t('common:dialogs.cloneRepo.description'),
    });
    if (repo) {
      addRepo(repo);
    }
  }, [addRepo, t]);

  return (
    <div className="flex flex-col gap-base p-base">
      <IconListItem
        icon={GitBranchIcon}
        label={t('common:actions.cloneFromGitUrl')}
        onClick={handleCloneRepo}
      />
    </div>
  );
}
