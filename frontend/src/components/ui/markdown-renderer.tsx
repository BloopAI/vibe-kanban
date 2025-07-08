import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className = '',
}: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        components={{
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
            <p {...props} className="mb-0 last:mb-0 leading-tight">
              {children}
            </p>
          ),
          h1: ({ children, ...props }) => (
            <h1
              {...props}
              className="text-lg font-bold mb-0 mt-1 first:mt-0 leading-tight"
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              {...props}
              className="text-base font-bold mb-0 mt-1 first:mt-0 leading-tight"
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              {...props}
              className="text-sm font-bold mb-0 mt-1 first:mt-0 leading-tight"
            >
              {children}
            </h3>
          ),
          ul: ({ children, ...props }) => (
            <ul {...props} className="list-disc ml-4 mb-0 -space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol {...props} className="list-decimal ml-4 mb-0 -space-y-1">
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li {...props} className="mb-0 leading-tight -my-0.5">
              {children}
            </li>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
