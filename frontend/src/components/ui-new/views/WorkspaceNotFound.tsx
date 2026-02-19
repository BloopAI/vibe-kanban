import { useTranslation } from 'react-i18next';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';

interface WorkspaceNotFoundProps {
  onCreateWorkspace?: () => void;
}

export function WorkspaceNotFound({
  onCreateWorkspace,
}: WorkspaceNotFoundProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-base p-double text-center">
      <MagnifyingGlassIcon className="size-icon-xl text-low" weight="duotone" />
      <div className="flex flex-col gap-half">
        <p className="text-base text-normal">{t('workspaces.notFound')}</p>
        <p className="text-sm text-low">
          {t('workspaces.notFoundDescription')}
        </p>
      </div>
      {onCreateWorkspace && (
        <button
          onClick={onCreateWorkspace}
          className="mt-half rounded-sm px-base py-half text-cta h-cta bg-brand hover:bg-brand-hover text-on-brand"
        >
          {t('workspaces.newWorkspace')}
        </button>
      )}
    </div>
  );
}
