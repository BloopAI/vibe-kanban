interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  return (
    <div
      className={`prose prose-sm max-w-none [&>*:first-child]:mt-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
    />
  );
}

function parseMarkdown(text: string): string {
  if (!text) return "";

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (must be before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    return `<pre class="bg-secondary rounded-md px-3 py-2 my-2 overflow-x-auto"><code class="text-xs font-mono">${code.trim()}</code></pre>`;
  });

  // Headings
  html = html.replace(
    /^### (.+)$/gm,
    '<h3 class="text-base font-semibold mt-3 mb-2">$1</h3>',
  );
  html = html.replace(
    /^## (.+)$/gm,
    '<h2 class="text-lg font-semibold mt-3 mb-2">$1</h2>',
  );
  html = html.replace(
    /^# (.+)$/gm,
    '<h1 class="text-xl font-bold mt-3 mb-2">$1</h1>',
  );

  // Bold and italic
  html = html.replace(
    /\*\*(.+?)\*\*/g,
    '<strong class="font-semibold">$1</strong>',
  );
  html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="font-mono bg-muted px-1 py-0.5 rounded text-xs">$1</code>',
  );

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noopener">$1</a>',
  );

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>');
  html = html.replace(
    /(<li[^>]*>.*<\/li>\n?)+/g,
    '<ul class="list-disc my-2">$&</ul>',
  );

  // Paragraphs - wrap lines that aren't already wrapped in tags
  html = html.replace(
    /^(?!<[huplo]|<li|<pre)(.+)$/gm,
    '<p class="mb-2 last:mb-0">$1</p>',
  );

  // Clean up empty paragraphs
  html = html.replace(/<p class="mb-2 last:mb-0"><\/p>/g, "");

  // Line breaks within paragraphs
  html = html.replace(/\n(?!<)/g, "<br>");

  return html;
}
