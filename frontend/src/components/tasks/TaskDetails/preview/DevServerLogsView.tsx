import { useTranslation } from 'react-i18next';
import { Terminal, ChevronDown } from 'lucide-react';
import ProcessLogsViewer, {
  ProcessLogsViewerContent,
} from '../ProcessLogsViewer';
import { ExecutionProcess } from 'shared/types';

interface DevServerLogsViewProps {
  latestDevServerProcess: ExecutionProcess | undefined;
  showLogs: boolean;
  onToggle: () => void;
  height?: string;
  showToggleText?: boolean;
  logs?: Array<{ type: 'STDOUT' | 'STDERR'; content: string }>;
  error?: string | null;
}

export function DevServerLogsView({
  latestDevServerProcess,
  showLogs,
  onToggle,
  height = 'h-60',
  showToggleText = true,
  logs,
  error,
}: DevServerLogsViewProps) {
  const { t } = useTranslation('tasks');

  if (!latestDevServerProcess) {
    return null;
  }

  return (
    <details
      className="group border-t bg-background"
      open={showLogs}
      onToggle={(e) => {
        if (e.currentTarget.open !== showLogs) {
          onToggle();
        }
      }}
    >
      <summary className="list-none cursor-pointer">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {t('preview.logs.title')}
            </span>
          </div>
          <div className="flex items-center text-sm">
            <ChevronDown
              className={`h-4 w-4 mr-1 ${showToggleText ? 'transition-transform' : ''} ${showLogs ? '' : 'rotate-180'}`}
            />
            {showToggleText
              ? showLogs
                ? t('preview.logs.hide')
                : t('preview.logs.show')
              : t('preview.logs.hide')}
          </div>
        </div>
      </summary>

      {showLogs && (
        <div className={height}>
          {logs ? (
            <ProcessLogsViewerContent logs={logs} error={error ?? null} />
          ) : (
            <ProcessLogsViewer processId={latestDevServerProcess.id} />
          )}
        </div>
      )}
    </details>
  );
}
