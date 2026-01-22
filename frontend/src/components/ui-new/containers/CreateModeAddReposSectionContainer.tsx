import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { RecentReposListContainer } from './RecentReposListContainer';
import { BrowseRepoButtonContainer } from './BrowseRepoButtonContainer';
import { CreateRepoButtonContainer } from './CreateRepoButtonContainer';

export function CreateModeAddReposSectionContainer() {
  const { t } = useTranslation(['common']);
  const { repos, addRepo } = useCreateMode();
  const registeredRepoPaths = useMemo(() => repos.map((r) => r.path), [repos]);

  return (
    <div className="flex flex-col gap-base p-base">
      <p className="text-xs text-low font-medium">
        {t('common:sections.recent')}
      </p>
      <RecentReposListContainer
        registeredRepoPaths={registeredRepoPaths}
        onRepoRegistered={addRepo}
      />
      <p className="text-xs text-low font-medium">
        {t('common:sections.other')}
      </p>
      <BrowseRepoButtonContainer disabled={false} onRepoRegistered={addRepo} />
      <CreateRepoButtonContainer onRepoCreated={addRepo} />
    </div>
  );
}
