import { useTranslation } from 'react-i18next';
import { Terminal, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProcessLogsViewer from '../ProcessLogsViewer';
import { ExecutionProcess } from 'shared/types';

interface DevServerLogsViewProps {
  latestDevServerProcess: ExecutionProcess | undefined;
  showLogs: boolean;
  onToggle: () => void;
  height?: string;
  showToggleText?: boolean;
}

export function DevServerLogsView({
  latestDevServerProcess,
  showLogs,
  onToggle,
  height = 'h-60',
  showToggleText = true,
}: DevServerLogsViewProps) {
  const { t } = useTranslation('tasks');

  if (!latestDevServerProcess) {
    return null;
  }

  return (
    <div className="border-t bg-background">
      {/* Logs toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {t('preview.logs.title')}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={onToggle}>
          <ChevronDown
            className={`h-4 w-4 mr-1 ${showToggleText ? 'transition-transform' : ''} ${showLogs ? '' : 'rotate-180'}`}
          />
          {showToggleText
            ? showLogs
              ? t('preview.logs.hide')
              : t('preview.logs.show')
            : t('preview.logs.hide')}
        </Button>
      </div>

      {/* Logs viewer */}
      {showLogs && (
        <div className={height}>
          <ProcessLogsViewer processId={latestDevServerProcess.id} />
        </div>
      )}
    </div>
  );
}
