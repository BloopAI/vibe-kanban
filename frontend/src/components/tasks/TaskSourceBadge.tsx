import { Github, ExternalLink } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TaskSourceBadgeProps {
  source: string | null;
  externalRef: string | null;
}

/**
 * Parses an external reference string to extract the URL.
 * Format: "github:owner/repo#123" -> "https://github.com/owner/repo/issues/123"
 */
function parseExternalRefUrl(externalRef: string | null): string | null {
  if (!externalRef) return null;

  const githubMatch = externalRef.match(/^github:(.+)#(\d+)$/);
  if (githubMatch) {
    const [, repo, issueNumber] = githubMatch;
    return `https://github.com/${repo}/issues/${issueNumber}`;
  }

  // Future: handle linear, jira, etc.
  // const linearMatch = externalRef.match(/^linear:(.+)$/);
  // const jiraMatch = externalRef.match(/^jira:(.+)$/);

  return null;
}

/**
 * Extracts issue identifier from external_ref for display.
 * Format: "github:owner/repo#123" -> "#123"
 */
function getIssueIdentifier(externalRef: string | null): string | null {
  if (!externalRef) return null;

  const githubMatch = externalRef.match(/^github:.+#(\d+)$/);
  if (githubMatch) {
    return `#${githubMatch[1]}`;
  }

  return null;
}

export function TaskSourceBadge({ source, externalRef }: TaskSourceBadgeProps) {
  // Don't show anything for manual or null sources
  if (!source || source === 'manual') {
    return null;
  }

  if (source === 'github') {
    const url = parseExternalRefUrl(externalRef);
    const issueId = getIssueIdentifier(externalRef);

    const badge = (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Github className="h-3 w-3" />
        {issueId && <span>{issueId}</span>}
      </span>
    );

    if (url) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="h-3 w-3" />
              {issueId && <span>{issueId}</span>}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </TooltipTrigger>
          <TooltipContent>
            <p>View on GitHub</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return badge;
  }

  // Future: handle other sources like linear, jira
  // if (source === 'linear') { ... }
  // if (source === 'jira') { ... }

  return null;
}
