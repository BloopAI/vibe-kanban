import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlass } from '@phosphor-icons/react';

interface WorkspaceNotFoundProps {
  showGoToWorkspaces?: boolean;
}

export function WorkspaceNotFound({
  showGoToWorkspaces = true,
}: WorkspaceNotFoundProps) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-base p-double text-center">
      <MagnifyingGlass className="size-icon-xl text-low" weight="duotone" />
      <div className="flex flex-col gap-half">
        <p className="text-base text-normal">
          {t('workspaces.notFound')}
        </p>
        <p className="text-sm text-low">
          {t('workspaces.notFoundDescription')}
        </p>
      </div>
      {showGoToWorkspaces && (
        <button
          onClick={() => navigate('/workspaces')}
          className="mt-half rounded-sm px-base py-half text-cta h-cta bg-brand hover:bg-brand-hover text-on-brand"
        >
          {t('workspaces.goToWorkspaces')}
        </button>
      )}
    </div>
  );
}
