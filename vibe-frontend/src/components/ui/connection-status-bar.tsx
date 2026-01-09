import { useState, useEffect } from 'react';
import { WifiOff, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { useConnectionSafe, ConnectionState } from '@/contexts/ConnectionContext';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface ConnectionStatusBarProps {
  className?: string;
}

const statusConfig: Record<ConnectionState, {
  show: boolean;
  icon: typeof WifiOff;
  message: string;
  bgClass: string;
  textClass: string;
}> = {
  online: {
    show: false,
    icon: WifiOff,
    message: '',
    bgClass: '',
    textClass: '',
  },
  degraded: {
    show: true,
    icon: AlertTriangle,
    message: 'Connection issues detected. Some features may be limited. Data shown may be outdated.',
    bgClass: 'bg-yellow-500/90 dark:bg-yellow-600/90',
    textClass: 'text-yellow-950 dark:text-yellow-50',
  },
  offline: {
    show: true,
    icon: WifiOff,
    message: "You're offline. Changes will sync when you reconnect.",
    bgClass: 'bg-red-500/90 dark:bg-red-600/90',
    textClass: 'text-white',
  },
};

export function ConnectionStatusBar({ className }: ConnectionStatusBarProps) {
  const { state, lastOnline } = useConnectionSafe();
  const [dismissed, setDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Reset dismissed state when connection state changes
  useEffect(() => {
    setDismissed(false);
  }, [state]);

  const config = statusConfig[state];

  // Don't render anything if online or dismissed
  if (!config.show || dismissed) {
    return null;
  }

  const Icon = config.icon;

  const formatLastOnline = () => {
    if (!lastOnline) return '';
    const now = new Date();
    const diff = now.getTime() - lastOnline.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;

    return lastOnline.toLocaleDateString();
  };

  const handleRetry = async () => {
    setIsRefreshing(true);
    // Trigger a page reload to re-attempt connections
    // In a more sophisticated implementation, this could trigger
    // query invalidation instead
    window.location.reload();
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'px-4 py-2',
        'flex items-center justify-between gap-3',
        'text-sm font-medium',
        'shadow-md',
        'animate-in slide-in-from-top duration-300',
        config.bgClass,
        config.textClass,
        className
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">{config.message}</span>
        {lastOnline && state === 'degraded' && (
          <span className="text-xs opacity-80 hidden sm:inline">
            Last connected: {formatLastOnline()}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRetry}
          disabled={isRefreshing}
          className={cn(
            'h-7 px-2',
            config.textClass,
            'hover:bg-white/20'
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1', isRefreshing && 'animate-spin')} />
          Retry
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDismissed(true)}
          className={cn(
            'h-7 w-7 p-0',
            config.textClass,
            'hover:bg-white/20'
          )}
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
