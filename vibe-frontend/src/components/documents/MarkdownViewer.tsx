import { useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

interface MarkdownViewerProps {
  content: string;
  className?: string;
  showOutline?: boolean;
}

export function MarkdownViewer({ content, className, showOutline = true }: MarkdownViewerProps) {
  // Extract headings for TOC
  const headings = useMemo(() => {
    const items: HeadingItem[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = `heading-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        items.push({ id, text, level });
      }
    });

    return items;
  }, [content]);

  const scrollToHeading = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Custom heading renderer to add IDs
  const headingIndex = { current: 0 };

  const components = useMemo(() => ({
    h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const heading = headings[headingIndex.current++];
      return <h1 id={heading?.id} className="text-3xl font-bold mt-8 mb-4 pb-2 border-b" {...props}>{children}</h1>;
    },
    h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const heading = headings[headingIndex.current++];
      return <h2 id={heading?.id} className="text-2xl font-semibold mt-6 mb-3 pb-1 border-b" {...props}>{children}</h2>;
    },
    h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const heading = headings[headingIndex.current++];
      return <h3 id={heading?.id} className="text-xl font-semibold mt-5 mb-2" {...props}>{children}</h3>;
    },
    h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const heading = headings[headingIndex.current++];
      return <h4 id={heading?.id} className="text-lg font-medium mt-4 mb-2" {...props}>{children}</h4>;
    },
    h5: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const heading = headings[headingIndex.current++];
      return <h5 id={heading?.id} className="text-base font-medium mt-3 mb-1" {...props}>{children}</h5>;
    },
    h6: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const heading = headings[headingIndex.current++];
      return <h6 id={heading?.id} className="text-sm font-medium mt-3 mb-1 text-muted-foreground" {...props}>{children}</h6>;
    },
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p className="my-3 leading-7" {...props}>{children}</p>
    ),
    ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className="my-3 ml-6 list-disc space-y-1" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
      <ol className="my-3 ml-6 list-decimal space-y-1" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
      <li className="leading-7" {...props}>{children}</li>
    ),
    blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
      <blockquote className="my-4 pl-4 border-l-4 border-muted-foreground/30 italic text-muted-foreground" {...props}>{children}</blockquote>
    ),
    code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm" {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
      <pre className="my-4 p-4 rounded-lg bg-muted overflow-x-auto" {...props}>{children}</pre>
    ),
    table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse border border-border" {...props}>{children}</table>
      </div>
    ),
    thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
      <thead className="bg-muted" {...props}>{children}</thead>
    ),
    th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <th className="px-4 py-2 text-left font-semibold border border-border" {...props}>{children}</th>
    ),
    td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <td className="px-4 py-2 border border-border" {...props}>{children}</td>
    ),
    a: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a href={href} className="text-primary underline hover:no-underline" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
    ),
    img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
      <img src={src} alt={alt} className="my-4 max-w-full rounded-lg shadow-md" {...props} />
    ),
    hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
      <hr className="my-6 border-border" {...props} />
    ),
    input: ({ type, checked, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => {
      if (type === 'checkbox') {
        return <input type="checkbox" checked={checked} disabled className="mr-2" {...props} />;
      }
      return <input type={type} {...props} />;
    },
  }), [headings]);

  // Reset heading index before each render
  headingIndex.current = 0;

  return (
    <div className={`flex h-full ${className || ''}`}>
      {/* Table of Contents Sidebar */}
      {showOutline && headings.length > 0 && (
        <div className="w-64 shrink-0 border-r bg-muted/30 overflow-auto">
          <div className="p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Table of Contents
            </h3>
            <nav className="space-y-1">
              {headings.map((heading) => (
                <button
                  key={heading.id}
                  onClick={() => scrollToHeading(heading.id)}
                  className={`block w-full text-left text-sm py-1 hover:text-primary transition-colors truncate ${
                    heading.level === 1 ? 'font-medium' :
                    heading.level === 2 ? 'pl-3' :
                    heading.level === 3 ? 'pl-6 text-muted-foreground' :
                    'pl-9 text-muted-foreground text-xs'
                  }`}
                >
                  {heading.text}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Markdown Content */}
      <div className="flex-1 min-w-0 overflow-auto">
        <article className="max-w-4xl mx-auto p-6 prose prose-slate dark:prose-invert">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={components}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}

export default MarkdownViewer;
