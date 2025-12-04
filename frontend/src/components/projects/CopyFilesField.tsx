import { useTranslation } from 'react-i18next';
import { MultiFileSearchTextarea } from '@/components/ui/multi-file-search-textarea';

interface CopyFilesFieldProps {
  value: string;
  onChange: (value: string) => void;
  projectId?: string;
  disabled?: boolean;
}

export function CopyFilesField({
  value,
  onChange,
  projectId,
  disabled = false,
}: CopyFilesFieldProps) {
  const { t } = useTranslation('projects');

  if (projectId) {
    // Editing existing project - use file search
    return (
      <MultiFileSearchTextarea
        value={value}
        onChange={onChange}
        placeholder={t('copyFiles.placeholderWithSearch')}
        rows={3}
        disabled={disabled}
        className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground disabled:opacity-50 rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        projectId={projectId}
        maxRows={6}
      />
    );
  }

  // Creating new project - fall back to plain textarea
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('copyFiles.placeholderSimple')}
      rows={3}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}
