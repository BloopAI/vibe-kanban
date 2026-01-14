import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface FileTreePlaceholderProps {
  className?: string;
}

export function FileTreePlaceholder({ className }: FileTreePlaceholderProps) {
  const { t } = useTranslation(['tasks', 'common']);

  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col items-center justify-center text-low',
        className
      )}
    >
      <p className="text-base">{t('common:fileTree.title')}</p>
    </div>
  );
}
