import { AlertTriangle, ArrowRight, Terminal } from 'lucide-react';
import { useUserSystem } from '@/components/config-provider';
import { useAgentNeedsInstallation } from '@/hooks/useAgentNeedsInstallation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type AgentInstallNoticeProps = {
  attemptId: string;
  className?: string;
};

export function AgentInstallNotice({
  attemptId,
  className,
}: AgentInstallNoticeProps) {
  const { executorDocs } = useUserSystem();
  const codingAgent = useAgentNeedsInstallation(attemptId);

  if (!codingAgent) {
    return null;
  }

  const docsEntry = executorDocs?.[codingAgent];
  const agentName = docsEntry?.display_name || codingAgent;
  const docsUrl = docsEntry?.url;

  return (
    <div
      className={cn(
        'w-full overflow-hidden border border-border/60 bg-card text-card-foreground shadow-lg pt-1 my-4',
        className
      )}
    >
      <div className="space-y-5 p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold leading-6">
              {agentName} isn't installed
            </h3>
            <p className="text-sm text-muted-foreground">
              Install {agentName} before sending more instructions.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/60 p-4">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral/10 text-neutral-foreground">
            <Terminal className="h-4 w-4" />
          </span>
          <p className="text-sm text-muted-foreground">
            Vibe Kanban needs this agent installed and authenticated to execute
            tasks on your behalf.
          </p>
        </div>

        <div>
          {docsUrl ? (
            <Button
              asChild
              className="h-auto w-full justify-center gap-2 px-4 py-3 text-sm font-semibold shadow-md"
            >
              <a href={docsUrl} target="_blank" rel="noopener noreferrer">
                Open the {agentName} installation guide
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Installation instructions for {agentName} are coming soon. Check
              your team's docs to finish setup.
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-border/60 bg-muted/40 px-5 py-3">
        <p className="text-xs text-muted-foreground">
          Once installation is complete, you can resend your instructions or
          start a new attempt.
        </p>
      </div>
    </div>
  );
}
