import { useTranslation } from 'react-i18next';
import { Terminal, ChevronUp } from 'lucide-react';
import ProcessLogsViewer, {
  ProcessLogsViewerContent,
} from '../ProcessLogsViewer';
import { ExecutionProcess } from 'shared/types';
import { Card } from '@/components/ui/card';
import { useState, useEffect } from 'react';

const DEV_SERVER_LOGS_OPEN_KEY = 'dev-server-logs-open';

interface DevServerLogsViewProps {
  latestDevServerProcess: ExecutionProcess | undefined;
  showLogs?: boolean;
  onToggle?: () => void;
  height?: string;
  showToggleText?: boolean;
  logs?: Array<{ type: 'STDOUT' | 'STDERR'; content: string }>;
  error?: string | null;
}

export function DevServerLogsView({
  latestDevServerProcess,
  showLogs: externalShowLogs,
  onToggle: externalOnToggle,
  height = 'h-60',
  showToggleText = true,
  logs,
  error,
}: DevServerLogsViewProps) {
  const { t } = useTranslation('tasks');
  const [internalShowLogs, setInternalShowLogs] = useState(() => {
    const stored = localStorage.getItem(DEV_SERVER_LOGS_OPEN_KEY);
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem(DEV_SERVER_LOGS_OPEN_KEY, String(internalShowLogs));
  }, [internalShowLogs]);

  if (!latestDevServerProcess) {
    return null;
  }

  const isControlled = externalShowLogs !== undefined;
  const showLogs = isControlled ? externalShowLogs : internalShowLogs;
  const handleToggle = () => {
    if (isControlled && externalOnToggle) {
      externalOnToggle();
    } else {
      setInternalShowLogs(!internalShowLogs);
    }
  };

  return (
    <details
      className="group border-t bg-background"
      open={showLogs}
      onToggle={(e) => {
        if (e.currentTarget.open !== showLogs) {
          handleToggle();
        }
      }}
    >
      <summary className="list-none cursor-pointer">
        <Card className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {t('preview.logs.title')}
            </span>
          </div>
          <ChevronUp
            aria-hidden
            className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </Card>
      </summary>

      <div className={height}>
        {logs ? (
          <ProcessLogsViewerContent logs={logs} error={error ?? null} />
        ) : (
          <ProcessLogsViewer processId={latestDevServerProcess.id} />
        )}
      </div>
    </details>
  );
}
