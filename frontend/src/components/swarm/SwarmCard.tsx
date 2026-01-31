import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Play,
  Pause,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Swarm } from './types';
import { SWARM_STATUS_CONFIG } from './constants';

interface SwarmCardProps {
  swarm: Swarm;
  taskCounts?: {
    pending: number;
    running: number;
    done: number;
    failed: number;
  };
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
}

export function SwarmCard({
  swarm,
  taskCounts = { pending: 0, running: 0, done: 0, failed: 0 },
  onPause,
  onResume,
}: SwarmCardProps) {
  const navigate = useNavigate();
  const config = SWARM_STATUS_CONFIG[swarm.status];
  const StatusIcon = config.icon;

  const handleClick = () => {
    navigate(`/swarms/${swarm.id}`);
  };

  const handleToggleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (swarm.status === 'active' && onPause) {
      onPause(swarm.id);
    } else if (swarm.status === 'paused' && onResume) {
      onResume(swarm.id);
    }
  };

  return (
    <Card
      className="cursor-pointer hover:border-foreground/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Abrir swarm ${swarm.name}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{swarm.name}</CardTitle>
            {swarm.description && (
              <CardDescription className="mt-1 line-clamp-2">
                {swarm.description}
              </CardDescription>
            )}
          </div>
          <Badge className={cn('ml-2 shrink-0', config.className)}>
            <StatusIcon className="h-3 w-3 mr-1" aria-hidden="true" />
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span>{taskCounts.pending}</span>
            </div>
            <div className="flex items-center gap-1">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>{taskCounts.running}</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
              <span>{taskCounts.done}</span>
            </div>
            {taskCounts.failed > 0 && (
              <div className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                <span>{taskCounts.failed}</span>
              </div>
            )}
          </div>
          {swarm.status !== 'stopped' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleStatus}
            >
              {swarm.status === 'active' ? (
                <>
                  <Pause className="h-4 w-4 mr-1" aria-hidden="true" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" aria-hidden="true" />
                  Resume
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
