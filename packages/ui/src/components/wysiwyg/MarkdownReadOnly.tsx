import { useMemo, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { PrCommentCard } from '../pr-comment-card';
import {
  ComponentInfoRenderer,
  type ComponentInfoData,
} from './ComponentInfoRenderer';
import {
  ImageRenderer,
  type OpenImagePreviewOptions,
} from './ImageRenderer';
import { AttachmentRenderer } from './AttachmentRenderer';
import { cn } from '../../lib/cn';

type AttachmentType = 'file' | 'thumbnail';

export interface MarkdownReadOnlyProps {
  value: string;
  className?: string;
  fetchAttachmentUrl: (
    attachmentId: string,
    type: AttachmentType
  ) => Promise<string>;
  openImagePreview: (options: OpenImagePreviewOptions) => void;
  findMatchingDiffPath?: (text: string) => string | null;
  onCodeClick?: (fullPath: string) => void;
}

// --- URL pattern helpers ---

const ATTACHMENT_HREF_RE =
  /^(attachment:\/\/|pending-attachment:\/\/|\.vibe-attachments\/)/;

const IMAGE_SRC_RE =
  /^(attachment:\/\/|pending-attachment:\/\/|\.vibe-attachments\/)/;

function sanitizeHref(href?: string): string | undefined {
  if (typeof href !== 'string') return undefined;
  const trimmed = href.trim();
  if (/^(javascript|vbscript|data):/i.test(trimmed)) return undefined;
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/')
  )
    return trimmed;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return undefined;
}

function isExternalHref(href?: string): boolean {
  if (!href) return false;
  return /^https:\/\//i.test(href);
}

// --- Remark plugins ---

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

// --- Component factory ---

function createComponents(
  fetchAttachmentUrl: MarkdownReadOnlyProps['fetchAttachmentUrl'],
  openImagePreview: MarkdownReadOnlyProps['openImagePreview'],
  findMatchingDiffPath?: MarkdownReadOnlyProps['findMatchingDiffPath'],
  onCodeClick?: MarkdownReadOnlyProps['onCodeClick']
): Components {
  return {
    // --- Images: detect attachment patterns ---
    img({ src, alt, ...rest }) {
      if (src && IMAGE_SRC_RE.test(src)) {
        return (
          <ImageRenderer
            src={src}
            altText={alt ?? ''}
            fetchAttachmentUrl={fetchAttachmentUrl}
            openImagePreview={openImagePreview}
          />
        );
      }

      // External / normal image — render as native <img>
      return (
        <img
          src={src}
          alt={alt}
          className="max-w-full rounded"
          loading="lazy"
          {...rest}
        />
      );
    },

    // --- Links: detect attachment patterns + sanitize ---
    a({ href, children, ...rest }) {
      if (href && ATTACHMENT_HREF_RE.test(href)) {
        // Attachment link → render as attachment card
        const label =
          typeof children === 'string'
            ? children
            : Array.isArray(children)
              ? children
                  .map((c) => (typeof c === 'string' ? c : ''))
                  .join('')
              : '';
        return (
          <AttachmentRenderer
            src={href}
            label={label}
            fetchAttachmentUrl={fetchAttachmentUrl}
          />
        );
      }

      const safeHref = sanitizeHref(href);

      if (!safeHref) {
        // Dangerous protocol — render as inert text
        return <span>{children}</span>;
      }

      if (isExternalHref(safeHref)) {
        return (
          <a
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline underline-offset-2 cursor-pointer hover:text-blue-800 dark:hover:text-blue-300"
            onClick={(e) => e.stopPropagation()}
            {...rest}
          >
            {children}
          </a>
        );
      }

      // Internal/relative link — render as inert text with title
      return (
        <span
          className="text-blue-600 dark:text-blue-400 underline underline-offset-2 cursor-not-allowed"
          title={href}
          role="link"
          aria-disabled="true"
        >
          {children}
        </span>
      );
    },

    // --- Code blocks: detect special languages, clickable inline code ---
    pre({ children, ...rest }) {
      // react-markdown wraps fenced code blocks in <pre><code>
      // We intercept at the <pre> level to detect special languages.
      if (
        children &&
        typeof children === 'object' &&
        'props' in (children as React.ReactElement)
      ) {
        const codeElement = children as React.ReactElement<
          ComponentPropsWithoutRef<'code'> & { className?: string }
        >;
        const codeClassName = codeElement.props?.className ?? '';
        const codeChildren = codeElement.props?.children;
        const rawText =
          typeof codeChildren === 'string' ? codeChildren.trim() : '';

        // PR comment: ```gh-comment
        if (codeClassName.includes('language-gh-comment') && rawText) {
          try {
            const data = JSON.parse(rawText);
            if (data.id && data.comment_type && data.author && data.body) {
              return (
                <PrCommentCard
                  author={data.author}
                  body={data.body}
                  createdAt={data.created_at}
                  url={data.url}
                  commentType={data.comment_type}
                  path={data.path}
                  line={data.line}
                  diffHunk={data.diff_hunk}
                  variant="full"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (data.url) {
                      window.open(
                        data.url,
                        '_blank',
                        'noopener,noreferrer'
                      );
                    }
                  }}
                />
              );
            }
          } catch {
            // Fall through to default rendering
          }
        }

        // Component info: ```vk-component
        if (codeClassName.includes('language-vk-component') && rawText) {
          try {
            const data = JSON.parse(rawText) as ComponentInfoData;
            if (data.framework && data.component && data.htmlPreview) {
              return <ComponentInfoRenderer data={data} />;
            }
          } catch {
            // Fall through to default rendering
          }
        }
      }

      // Default: render with syntax highlighting (from rehype-highlight)
      return (
        <pre
          className="block font-mono bg-secondary rounded-md px-3 py-2 my-2 whitespace-pre overflow-x-auto"
          {...rest}
        >
          {children}
        </pre>
      );
    },

    code({ className, children, ...rest }) {
      // Fenced code blocks are handled by the `pre` override above.
      // This handles inline code only (no `pre` parent → no className prefix).
      const isInline = !className;

      if (isInline) {
        const text =
          typeof children === 'string'
            ? children.trim()
            : Array.isArray(children)
              ? children
                  .map((c) => (typeof c === 'string' ? c : ''))
                  .join('')
                  .trim()
              : '';

        const matchedPath =
          findMatchingDiffPath && text
            ? findMatchingDiffPath(text)
            : null;

        if (matchedPath && onCodeClick) {
          return (
            <code
              className="font-mono bg-muted bg-panel px-1 py-0.5 rounded cursor-pointer clickable-code"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCodeClick(matchedPath);
              }}
              role="button"
              tabIndex={0}
              {...rest}
            >
              {children}
            </code>
          );
        }

        return (
          <code
            className="font-mono bg-muted bg-panel px-1 py-0.5 rounded"
            {...rest}
          >
            {children}
          </code>
        );
      }

      // Fenced code inside pre (shouldn't reach here normally, but safety net)
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    },

    // --- Standard element styling to match existing Lexical theme ---
    h1: ({ children, ...rest }) => (
      <h1
        className="mt-4 mb-2 text-2xl font-semibold"
        {...rest}
      >
        {children}
      </h1>
    ),
    h2: ({ children, ...rest }) => (
      <h2
        className="mt-3 mb-2 text-xl font-semibold"
        {...rest}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...rest }) => (
      <h3
        className="mt-3 mb-2 text-lg font-semibold"
        {...rest}
      >
        {children}
      </h3>
    ),
    h4: ({ children, ...rest }) => (
      <h4
        className="mt-2 mb-1 text-base font-medium"
        {...rest}
      >
        {children}
      </h4>
    ),
    h5: ({ children, ...rest }) => (
      <h5
        className="mt-2 mb-1 text-sm font-medium"
        {...rest}
      >
        {children}
      </h5>
    ),
    h6: ({ children, ...rest }) => (
      <h6
        className="mt-2 mb-1 text-xs font-medium uppercase tracking-wide"
        {...rest}
      >
        {children}
      </h6>
    ),
    blockquote: ({ children, ...rest }) => (
      <blockquote
        className="my-3 border-l-4 border-primary-foreground pl-4 text-muted-foreground"
        {...rest}
      >
        {children}
      </blockquote>
    ),
    ul: ({ children, ...rest }) => (
      <ul className="my-1 list-disc list-inside" {...rest}>
        {children}
      </ul>
    ),
    ol: ({ children, ...rest }) => (
      <ol className="my-1 list-decimal list-inside" {...rest}>
        {children}
      </ol>
    ),
    table: ({ children, ...rest }) => (
      <table
        className="border-collapse my-2 w-full text-sm"
        {...rest}
      >
        {children}
      </table>
    ),
    th: ({ children, ...rest }) => (
      <th
        className="bg-muted font-semibold border border-low px-3 py-2 text-left align-top"
        {...rest}
      >
        {children}
      </th>
    ),
    td: ({ children, ...rest }) => (
      <td
        className="border border-low px-3 py-2 text-left align-top"
        {...rest}
      >
        {children}
      </td>
    ),
    hr: ({ ...rest }) => (
      <hr className="my-4 border-border" {...rest} />
    ),
    p: ({ children, ...rest }) => (
      <p className="mb-1 last:mb-0" {...rest}>
        {children}
      </p>
    ),
    strong: ({ children, ...rest }) => (
      <strong className="font-semibold" {...rest}>
        {children}
      </strong>
    ),
    em: ({ children, ...rest }) => (
      <em className="italic" {...rest}>
        {children}
      </em>
    ),
    del: ({ children, ...rest }) => (
      <del className="line-through" {...rest}>
        {children}
      </del>
    ),
    // GFM task list items (remark-gfm renders these with input[type=checkbox])
    input: ({ type, checked, ...rest }) => {
      if (type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={checked}
            disabled
            className="mr-1 align-middle"
            {...rest}
          />
        );
      }
      return <input type={type} checked={checked} {...rest} />;
    },
  };
}

/**
 * Read-only markdown renderer using react-markdown + remark-gfm.
 *
 * Handles all custom content types:
 * - Images with attachment:// and .vibe-attachments/ URLs
 * - Attachment links
 * - PR comment fenced code blocks (```gh-comment)
 * - Component info fenced code blocks (```vk-component)
 * - Clickable inline code matching diff paths
 * - Link sanitization
 */
export function MarkdownReadOnly({
  value,
  className,
  fetchAttachmentUrl,
  openImagePreview,
  findMatchingDiffPath,
  onCodeClick,
}: MarkdownReadOnlyProps): JSX.Element {
  const components = useMemo(
    () =>
      createComponents(
        fetchAttachmentUrl,
        openImagePreview,
        findMatchingDiffPath,
        onCodeClick
      ),
    [fetchAttachmentUrl, openImagePreview, findMatchingDiffPath, onCodeClick]
  );

  // Unescape markdown-escaped underscores for cleaner rendering
  const normalizedValue = useMemo(
    () => value.replace(/\\_/g, '_'),
    [value]
  );

  return (
    <div className={cn('wysiwyg text-base', className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {normalizedValue}
      </ReactMarkdown>
    </div>
  );
}
