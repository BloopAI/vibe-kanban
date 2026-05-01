import { useMemo } from 'react';
import { cn } from '../lib/cn';
import { linkifyGitHubRefs } from '../lib/github-ref-preprocessor';

export interface ChatMarkdownRenderProps {
  content: string;
  className?: string;
  workspaceId?: string;
}

interface ChatMarkdownProps {
  content: string;
  maxWidth?: string;
  className?: string;
  workspaceId?: string;
  renderContent: (props: ChatMarkdownRenderProps) => React.ReactNode;
}

export function ChatMarkdown({
  content,
  maxWidth = '800px',
  className,
  workspaceId,
  renderContent,
}: ChatMarkdownProps) {
  const contentClassName = cn('whitespace-pre-wrap break-words', className);
  const processedContent = useMemo(() => linkifyGitHubRefs(content), [content]);

  return (
    <div className="text-sm" style={{ maxWidth }}>
      {renderContent({
        content: processedContent,
        className: contentClassName,
        workspaceId,
      })}
    </div>
  );
}
