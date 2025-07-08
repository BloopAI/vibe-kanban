import { Fragment } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className = '',
}: MarkdownRendererProps) {
  // Simple regex-based markdown parser for basic formatting
  const parseMarkdown = (text: string): React.ReactNode[] => {
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let keyCounter = 0;

    // Combined regex for all markdown patterns
    const markdownRegex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
    let match;

    while ((match = markdownRegex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        elements.push(
          <Fragment key={keyCounter++}>
            {text.substring(lastIndex, match.index)}
          </Fragment>
        );
      }

      const [fullMatch, inlineCode, bold, italic] = match;

      if (inlineCode) {
        // Inline code: `code`
        const codeContent = inlineCode.slice(1, -1); // Remove backticks
        elements.push(
          <code
            key={keyCounter++}
            className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono"
          >
            {codeContent}
          </code>
        );
      } else if (bold) {
        // Bold: **text**
        const boldContent = bold.slice(2, -2); // Remove **
        elements.push(
          <strong key={keyCounter++} className="font-bold">
            {boldContent}
          </strong>
        );
      } else if (italic) {
        // Italic: *text*
        const italicContent = italic.slice(1, -1); // Remove *
        elements.push(
          <em key={keyCounter++} className="italic">
            {italicContent}
          </em>
        );
      }

      lastIndex = match.index + fullMatch.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      elements.push(
        <Fragment key={keyCounter++}>{text.substring(lastIndex)}</Fragment>
      );
    }

    return elements;
  };

  // Split by lines and process each line
  const lines = content.split('\n');

  return (
    <div className={className}>
      {lines.map((line, index) => (
        <div key={index}>
          {parseMarkdown(line)}
          {index < lines.length - 1 && <br />}
        </div>
      ))}
    </div>
  );
}
