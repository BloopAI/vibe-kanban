import { useContext, useEffect, useState } from 'react';
import { GitPullRequest, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  TaskDetailsContext,
  TaskSelectedAttemptContext,
} from '@/components/context/taskDetailsContext';
import { attemptsApi } from '@/lib/api';

interface PipelineStatus {
  id: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'skipped';
  web_url: string;
  created_at: string;
  finished_at?: string;
}

interface MergeRequestStatus {
  state: 'opened' | 'closed' | 'merged';
  merge_status: 'can_be_merged' | 'cannot_be_merged' | 'checking';
  has_conflicts: boolean;
  pipeline?: PipelineStatus;
  web_url: string;
  iid: number;
  title: string;
  description?: string;
}

export function MergeRequestInfo() {
  const { projectId, projectRepoType } = useContext(TaskDetailsContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const [mrStatus, setMrStatus] = useState<MergeRequestStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState(false);

  // Check if this is a GitLab project with a MR
  const isGitLabWithMR = projectRepoType === 'gitlab' && selectedAttempt?.pr_url;

  const fetchMRStatus = async () => {
    if (!isGitLabWithMR || !projectId || !selectedAttempt?.id) return;

    setLoading(true);
    setError(null);

    try {
      const status = await attemptsApi.getMRStatus(
        projectId,
        selectedAttempt.task_id,
        selectedAttempt.id
      );
      setMrStatus(status);
    } catch (err: any) {
      console.error('Failed to fetch MR status:', err);
      // Only show error if it's not a configuration issue
      if (err?.status === 500) {
        setConfigError(true);
      } else {
        setError('Failed to load MR status');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Don't fetch if config error already detected
    if (configError) return;
    
    if (isGitLabWithMR) {
      fetchMRStatus();
    }
    
    // Poll for updates every 30 seconds if no config error
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isGitLabWithMR && !configError) {
      interval = setInterval(fetchMRStatus, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGitLabWithMR, projectId, selectedAttempt?.id]); // Remove configError from deps to prevent re-fetching

  if (!isGitLabWithMR) return null;

  const getPipelineIcon = (status?: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPipelineBadge = (status?: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      success: 'default',
      failed: 'destructive',
      running: 'secondary',
      pending: 'outline',
    };

    return (
      <Badge variant={variants[status || ''] || 'outline'}>
        {status || 'No pipeline'}
      </Badge>
    );
  };

  const getMergeStatusBadge = () => {
    if (!mrStatus) return null;

    if (mrStatus.state === 'merged') {
      return <Badge className="bg-purple-600">Merged</Badge>;
    }

    if (mrStatus.state === 'closed') {
      return <Badge variant="secondary">Closed</Badge>;
    }

    switch (mrStatus.merge_status) {
      case 'can_be_merged':
        return <Badge className="bg-green-600">Can be merged</Badge>;
      case 'cannot_be_merged':
        return <Badge variant="destructive">Cannot be merged</Badge>;
      case 'checking':
        return <Badge variant="outline">Checking...</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitPullRequest className="h-4 w-4" />
          <h3 className="font-semibold">Merge Request</h3>
          {getMergeStatusBadge()}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchMRStatus}
          disabled={loading || configError}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-500 mb-2">{error}</div>
      )}

      {mrStatus && (
        <>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground">Title</div>
              <div className="text-sm font-medium">{mrStatus.title}</div>
            </div>

            {mrStatus.description && (
              <div>
                <div className="text-sm text-muted-foreground">Description</div>
                <div className="text-sm">{mrStatus.description}</div>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Pipeline</span>
                {mrStatus.pipeline && getPipelineIcon(mrStatus.pipeline.status)}
              </div>
              {getPipelineBadge(mrStatus.pipeline?.status)}
            </div>

            {mrStatus.pipeline && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(mrStatus.pipeline!.web_url, '_blank')}
                  className="text-xs"
                >
                  View Pipeline
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(mrStatus.web_url, '_blank')}
                  className="text-xs"
                >
                  View MR on GitLab
                </Button>
              </div>
            )}

            {mrStatus.has_conflicts && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle className="h-4 w-4" />
                This MR has conflicts that must be resolved
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}