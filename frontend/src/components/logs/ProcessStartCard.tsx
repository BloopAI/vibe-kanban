import { Clock, Cog, Play, Terminal, Code, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessStartPayload } from '@/types/logs';

interface ProcessStartCardProps {
  payload: ProcessStartPayload;
  isCollapsed: boolean;
  onToggle: (processId: string) => void;
}

function ProcessStartCard({
  payload,
  isCollapsed,
  onToggle,
}: ProcessStartCardProps) {
  const getProcessIcon = (runReason: string) => {
    switch (runReason) {
      case 'setupscript':
        return <Cog className="h-4 w-4" />;
      case 'cleanupscript':
        return <Terminal className="h-4 w-4" />;
      case 'codingagent':
        return <Code className="h-4 w-4" />;
      case 'devserver':
        return <Play className="h-4 w-4" />;
      default:
        return <Cog className="h-4 w-4" />;
    }
  };

  const getProcessLabel = (runReason: string) => {
    switch (runReason) {
      case 'setupscript':
        return 'Setup Script';
      case 'cleanupscript':
        return 'Cleanup Script';
      case 'codingagent':
        return 'Coding Agent';
      case 'devserver':
        return 'Dev Server';
      default:
        return runReason;
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString();
  };

  const handleClick = () => {
    onToggle(payload.processId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(payload.processId);
    }
  };

  return (
    <div className="px-4 pt-4 pb-2">
      <div
        className="p-2 cursor-pointer select-none hover:bg-muted/70 transition-colors"
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2 text-foreground">
            {getProcessIcon(payload.runReason)}
            <span className="font-medium">
              {getProcessLabel(payload.runReason)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatTime(payload.startedAt)}</span>
          </div>
          <div
            className={`ml-auto text-xs px-2 py-1 rounded-full ${
              payload.status === 'running'
                ? 'bg-blue-100 text-blue-700'
                : payload.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : payload.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
            }`}
          >
            {payload.status}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isCollapsed && '-rotate-90'
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default ProcessStartCard;
