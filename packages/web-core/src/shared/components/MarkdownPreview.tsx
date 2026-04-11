import { useMemo, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cn } from '@/shared/lib/utils';
import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownPreviewProps {
  content: string;
  theme: 'light' | 'dark';
  className?: string;
}

const remarkPlugins = [remarkGfm];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rehypePlugins: any[] = [
  rehypeRaw,
  [rehypeSanitize, defaultSchema],
  rehypeHighlight,
];

export function MarkdownPreview({
  content,
  theme,
  className,
}: MarkdownPreviewProps) {
  const components = useMemo(
    () => ({
      h1: ({ children, ...props }: ComponentPropsWithoutRef<'h1'>) => (
        <h1
          className="text-xl font-bold text-high mb-4 mt-6 pb-2 border-b border-border first:mt-0"
          {...props}
        >
          {children}
        </h1>
      ),
      h2: ({ children, ...props }: ComponentPropsWithoutRef<'h2'>) => (
        <h2
          className="text-lg font-semibold text-high mb-3 mt-5 pb-1.5 border-b border-border first:mt-0"
          {...props}
        >
          {children}
        </h2>
      ),
      h3: ({ children, ...props }: ComponentPropsWithoutRef<'h3'>) => (
        <h3 className="text-base font-semibold text-high mb-2 mt-4" {...props}>
          {children}
        </h3>
      ),
      h4: ({ children, ...props }: ComponentPropsWithoutRef<'h4'>) => (
        <h4 className="text-sm font-semibold text-high mb-2 mt-3" {...props}>
          {children}
        </h4>
      ),
      h5: ({ children, ...props }: ComponentPropsWithoutRef<'h5'>) => (
        <h5 className="text-sm font-medium text-high mb-1 mt-3" {...props}>
          {children}
        </h5>
      ),
      h6: ({ children, ...props }: ComponentPropsWithoutRef<'h6'>) => (
        <h6 className="text-sm font-medium text-low mb-1 mt-3" {...props}>
          {children}
        </h6>
      ),
      p: ({ children, ...props }: ComponentPropsWithoutRef<'p'>) => (
        <p className="text-sm text-normal mb-3 leading-relaxed" {...props}>
          {children}
        </p>
      ),
      a: ({ children, ...props }: ComponentPropsWithoutRef<'a'>) => (
        <a
          {...props}
          className="text-brand hover:text-brand-hover hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ),
      ul: ({ children, ...props }: ComponentPropsWithoutRef<'ul'>) => (
        <ul
          className="list-disc pl-6 mb-3 text-sm text-normal space-y-1"
          {...props}
        >
          {children}
        </ul>
      ),
      ol: ({ children, ...props }: ComponentPropsWithoutRef<'ol'>) => (
        <ol
          className="list-decimal pl-6 mb-3 text-sm text-normal space-y-1"
          {...props}
        >
          {children}
        </ol>
      ),
      li: ({ children, ...props }: ComponentPropsWithoutRef<'li'>) => (
        <li className="leading-relaxed" {...props}>
          {children}
        </li>
      ),
      blockquote: ({
        children,
        ...props
      }: ComponentPropsWithoutRef<'blockquote'>) => (
        <blockquote
          className="border-l-2 border-border pl-base text-low italic mb-3"
          {...props}
        >
          {children}
        </blockquote>
      ),
      table: ({ children, ...props }: ComponentPropsWithoutRef<'table'>) => (
        <div className="overflow-auto mb-3">
          <table className="w-full text-sm border-collapse" {...props}>
            {children}
          </table>
        </div>
      ),
      thead: ({ children, ...props }: ComponentPropsWithoutRef<'thead'>) => (
        <thead className="bg-panel" {...props}>
          {children}
        </thead>
      ),
      th: ({ children, ...props }: ComponentPropsWithoutRef<'th'>) => (
        <th
          className="text-left font-semibold text-high p-2 border border-border"
          {...props}
        >
          {children}
        </th>
      ),
      td: ({ children, ...props }: ComponentPropsWithoutRef<'td'>) => (
        <td className="p-2 border border-border text-normal" {...props}>
          {children}
        </td>
      ),
      hr: (props: ComponentPropsWithoutRef<'hr'>) => (
        <hr className="border-border my-4" {...props} />
      ),
      img: (props: ComponentPropsWithoutRef<'img'>) => (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img className="max-w-full rounded-sm" {...props} />
      ),
      pre: ({ children, ...props }: ComponentPropsWithoutRef<'pre'>) => {
        // When a mermaid code block is rendered, the code component returns
        // <MermaidDiagram> but react-markdown still wraps it in <pre>.
        // Detect this and render a plain wrapper instead.
        const child = Array.isArray(children) ? children[0] : children;
        if (
          child &&
          typeof child === 'object' &&
          'props' in child &&
          child.props?.className &&
          /language-mermaid/.test(child.props.className)
        ) {
          return <>{children}</>;
        }
        return (
          <pre
            className="text-xs p-base rounded-sm bg-panel overflow-auto mb-3 font-ibm-plex-mono"
            {...props}
          >
            {children}
          </pre>
        );
      },
      code: ({
        className: codeClassName,
        children,
        ...props
      }: ComponentPropsWithoutRef<'code'>) => {
        const match = /language-(\w+)/.exec(codeClassName || '');
        const language = match?.[1];
        const codeString = String(children).replace(/\n$/, '');

        // Mermaid diagrams
        if (language === 'mermaid') {
          return <MermaidDiagram chart={codeString} theme={theme} />;
        }

        // All code elements: fenced blocks get styling from the <pre> wrapper,
        // inline code gets styling via the wrapper div's CSS selector.
        return (
          <code className={cn(codeClassName, 'font-ibm-plex-mono')} {...props}>
            {children}
          </code>
        );
      },
      input: ({
        type,
        checked,
        ...props
      }: ComponentPropsWithoutRef<'input'>) => {
        if (type === 'checkbox') {
          return (
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="mr-2 mt-0.5"
              {...props}
            />
          );
        }
        return <input type={type} checked={checked} {...props} />;
      },
    }),
    [theme]
  );

  return (
    <div
      className={cn(
        'markdown-preview',
        // Inline code styling: targets <code> not inside <pre> (i.e. not fenced blocks)
        '[&_:not(pre)>code]:text-xs [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:rounded-sm [&_:not(pre)>code]:bg-panel [&_:not(pre)>code]:text-high',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
