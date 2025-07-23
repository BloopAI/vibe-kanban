import ReactMarkdown, { Components } from 'react-markdown';
import { memo, useMemo } from 'react';
import { Attachment } from 'shared/types';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  attachments?: Attachment[];
}

function MarkdownRenderer({ content, className = '', attachments = [] }: MarkdownRendererProps) {
  // Process content to replace attachment references with actual URLs
  const processedContent = useMemo(() => {
    let processed = content;
    
    // Replace attachment references like ![alt](attachment:filename) with actual URLs
    attachments.forEach((attachment) => {
      const pattern = new RegExp(
        `!\\[([^\\]]*)\\]\\(attachment:${attachment.original_filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
        'g'
      );
      processed = processed.replace(
        pattern,
        `![$1](/api/attachments/${attachment.id})`
      );
    });
    
    return processed;
  }, [content, attachments]);

  const components: Components = useMemo(
    () => ({
      code: ({ children, ...props }) => (
        <code
          {...props}
          className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono"
        >
          {children}
        </code>
      ),
      strong: ({ children, ...props }) => (
        <strong {...props} className="font-bold">
          {children}
        </strong>
      ),
      em: ({ children, ...props }) => (
        <em {...props} className="italic">
          {children}
        </em>
      ),
      p: ({ children, ...props }) => (
        <p {...props} className="leading-tight">
          {children}
        </p>
      ),
      h1: ({ children, ...props }) => (
        <h1 {...props} className="text-lg font-bold leading-tight">
          {children}
        </h1>
      ),
      h2: ({ children, ...props }) => (
        <h2 {...props} className="text-base font-bold leading-tight">
          {children}
        </h2>
      ),
      h3: ({ children, ...props }) => (
        <h3 {...props} className="text-sm font-bold leading-tight">
          {children}
        </h3>
      ),
      ul: ({ children, ...props }) => (
        <ul {...props} className="list-disc ml-2">
          {children}
        </ul>
      ),
      ol: ({ children, ...props }) => (
        <ol {...props} className="list-decimal ml-2">
          {children}
        </ol>
      ),
      li: ({ children, ...props }) => (
        <li {...props} className="leading-tight">
          {children}
        </li>
      ),
      img: ({ src, alt, ...props }) => (
        <img
          {...props}
          src={src}
          alt={alt}
          className="max-w-full h-auto rounded-lg my-2"
          loading="lazy"
        />
      ),
    }),
    []
  );
  return (
    <div className={className}>
      <ReactMarkdown components={components}>{processedContent}</ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownRenderer);
