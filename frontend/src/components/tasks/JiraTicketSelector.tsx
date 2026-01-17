import { useState } from 'react';
import { RefreshCw, ExternalLink, AlertCircle, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { JiraIssue, JiraIssuesResponse } from 'shared/types';

interface JiraTicketSelectorProps {
  selectedTicket: JiraIssue | null;
  onSelectTicket: (ticket: JiraIssue | null) => void;
  disabled?: boolean;
  className?: string;
}

export function JiraTicketSelector({
  selectedTicket,
  onSelectTicket,
  disabled,
  className = '',
}: JiraTicketSelectorProps) {
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const fetchIssues = async (forceRefresh = false) => {
    if (loading || cooldown) return; // Debounce: prevent spam clicks
    setLoading(true);
    setError(null);

    try {
      const endpoint = forceRefresh ? '/api/jira/refresh' : '/api/jira/my-issues';
      const options = forceRefresh ? { method: 'POST' } : undefined;
      const response = await fetch(endpoint, options);
      const data = await response.json();

      if (data.success && data.data) {
        const jiraResponse = data.data as JiraIssuesResponse;
        setIssues(jiraResponse.issues);
        setHasLoaded(true);
      } else {
        // Check for error_data (our custom error response)
        const errorMsg =
          data.error_data?.details ||
          data.message ||
          'Failed to fetch Jira issues';
        setError(errorMsg);
      }
    } catch (e) {
      setError('Network error fetching Jira issues');
    } finally {
      setLoading(false);
      // Brief cooldown to prevent spam clicks
      setCooldown(true);
      setTimeout(() => setCooldown(false), 2000);
    }
  };

  const handleSelect = (issue: JiraIssue | null) => {
    onSelectTicket(issue);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between text-xs min-w-[200px]"
            disabled={disabled || loading}
            aria-label="Select Jira ticket"
          >
            <div className="flex items-center gap-1.5 w-full">
              <Ticket className="h-3 w-3 flex-shrink-0" />
              {selectedTicket ? (
                <span className="flex items-center gap-1.5 truncate">
                  <span className="font-mono text-[10px] bg-muted px-1 rounded flex-shrink-0">
                    {selectedTicket.key}
                  </span>
                  <span className="truncate">{selectedTicket.summary}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {hasLoaded ? 'Select ticket...' : 'Load Jira tickets'}
                </span>
              )}
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80 max-h-[300px] overflow-y-auto">
          {!hasLoaded && !loading && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                fetchIssues();
              }}
              className="justify-center"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Load my Jira tickets
            </DropdownMenuItem>
          )}

          {loading && (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Loading tickets (~10s)...
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs">{error}</span>
            </div>
          )}

          {hasLoaded && !loading && issues.length === 0 && !error && (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">
              No assigned tickets found
            </div>
          )}

          {hasLoaded && issues.length > 0 && (
            <>
              <DropdownMenuItem
                onSelect={() => handleSelect(null)}
                className={!selectedTicket ? 'bg-accent' : ''}
              >
                <span className="text-muted-foreground">No ticket</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {issues.map((issue) => (
                <DropdownMenuItem
                  key={issue.key}
                  onSelect={() => handleSelect(issue)}
                  className={cn(
                    'flex flex-col items-start gap-0.5',
                    selectedTicket?.key === issue.key && 'bg-accent'
                  )}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span className="font-mono text-[10px] bg-muted px-1 rounded">
                      {issue.key}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {issue.status}
                    </span>
                  </div>
                  <span className="text-xs truncate w-full">
                    {issue.summary}
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          {hasLoaded && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  fetchIssues(true); // Force refresh - bypass cache
                }}
                className="justify-center text-muted-foreground"
              >
                <RefreshCw
                  className={cn('h-3 w-3 mr-2', loading && 'animate-spin')}
                />
                Refresh
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedTicket?.url && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          asChild
          title="Open in Jira"
        >
          <a
            href={selectedTicket.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </Button>
      )}
    </div>
  );
}
