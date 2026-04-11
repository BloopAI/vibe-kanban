import React from 'react';

interface SimpleMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Lightweight markdown renderer for GitHub release note bodies.
 * Handles: ## headers, bullet lists (* / -), **bold**, [links](url),
 * bare URLs (with PR shortening), and @mentions.
 */
export function SimpleMarkdown({ content, className }: SimpleMarkdownProps) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];
  let key = 0;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={key++} className="space-y-0.5 text-sm text-normal">
          {currentList.map((item, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-low shrink-0">{'·'}</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={key++} className="text-sm font-semibold text-high">
          {trimmed.slice(3)}
        </h3>
      );
      continue;
    }

    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      currentList.push(trimmed.slice(2));
      continue;
    }

    flushList();
    elements.push(
      <p key={key++} className="text-xs text-low">
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList();

  return <div className={className}>{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex =
    /(\*\*(.+?)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s)]+)|(@[\w-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(
        <strong key={i++} className="font-semibold text-high">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // [text](url)
      parts.push(
        <a
          key={i++}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline"
        >
          {match[4]}
        </a>
      );
    } else if (match[6]) {
      // Bare URL — shorten PR links
      const url = match[6];
      const prMatch = url.match(/\/pull\/(\d+)$/);
      const label = prMatch ? `#${prMatch[1]}` : 'link';
      parts.push(
        <a
          key={i++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline"
        >
          {label}
        </a>
      );
    } else if (match[7]) {
      // @mention
      parts.push(
        <span key={i++} className="text-low">
          {match[7]}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
}
