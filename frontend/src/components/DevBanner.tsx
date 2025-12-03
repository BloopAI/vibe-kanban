import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUserSystem } from '@/components/ConfigProvider';

export function DevBanner() {
  const { t } = useTranslation();
  const { config, environment } = useUserSystem();

  // Only show when backend is in dev mode
  if (!environment?.is_dev_mode) {
    return null;
  }

  const devBanner = config?.dev_banner;
  const bgColor = devBanner?.background_color || undefined;
  const fgColor = devBanner?.foreground_color || undefined;

  // Build the info parts to display
  // Use shorter text when showing system info to save space
  const showSystemInfo = devBanner?.show_hostname || devBanner?.show_os_info;
  const infoParts: string[] = [
    showSystemInfo ? t('devMode.bannerShort') : t('devMode.banner'),
  ];
  if (devBanner?.show_hostname && environment?.hostname) {
    infoParts.push(environment.hostname);
  }
  if (devBanner?.show_os_info && environment) {
    infoParts.push(`${environment.os_type} ${environment.os_version}`);
  }

  return (
    <div
      className="text-center py-2 px-4 text-sm font-medium border-b"
      style={{
        backgroundColor: bgColor || '#f97316', // orange-500
        color: fgColor || 'white',
        borderColor: bgColor ? undefined : '#ea580c', // orange-600
      }}
    >
      <div className="flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>{infoParts.join(' | ')}</span>
      </div>
    </div>
  );
}
