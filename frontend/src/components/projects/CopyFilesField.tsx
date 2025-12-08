import { useTranslation } from 'react-i18next';
import { MultiFileSearchTextarea } from '@/components/ui/multi-file-search-textarea';

interface CopyFilesFieldProps {
  value: string;
  onChange: (value: string) => void;
  projectId: string;
  disabled?: boolean;
}

export function CopyFilesField({
  value,
  onChange,
  projectId,
  disabled = false,
}: CopyFilesFieldProps) {
  const { t } = useTranslation('projects');

  return (
    <MultiFileSearchTextarea
      value={value}
      onChange={onChange}
      placeholder={t('copyFilesPlaceholderWithSearch')}
      rows={3}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground disabled:opacity-50 rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
      projectId={projectId}
      maxRows={6}
    />
  );
}
