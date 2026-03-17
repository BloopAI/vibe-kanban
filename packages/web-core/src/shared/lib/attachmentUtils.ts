/** Downloads an attachment from a URL and triggers a browser save dialog. */
export async function downloadBlobUrl(
  url: string,
  filename: string
): Promise<void> {
  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error('Failed to download attachment');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const ATTACHMENT_MARKDOWN_PATTERN = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;

interface AttachmentMarkdownMatch {
  prefix: string;
  label: string;
  src: string;
  start: number;
  end: number;
}

function findAttachmentMarkdownMatches(
  content: string
): AttachmentMarkdownMatch[] {
  const matches: AttachmentMarkdownMatch[] = [];

  for (const match of content.matchAll(ATTACHMENT_MARKDOWN_PATTERN)) {
    const fullMatch = match[0];
    const start = match.index;
    if (start == null) {
      continue;
    }

    matches.push({
      prefix: match[1] ?? '',
      label: match[2] ?? '',
      src: match[3] ?? '',
      start,
      end: start + fullMatch.length,
    });
  }

  return matches;
}

function normalizeAttachmentWhitespace(content: string): string {
  return content
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function removeAttachmentSlice(
  content: string,
  start: number,
  end: number
): string {
  let before = content.slice(0, start);
  let after = content.slice(end);

  if (before.length === 0 && after.startsWith('\n')) {
    after = after.slice(1);
  } else if (after.length === 0 && before.endsWith('\n')) {
    before = before.slice(0, -1);
  } else if (before.endsWith('\n') && after.startsWith('\n')) {
    after = after.slice(1);
  } else if (before.endsWith(' ') && after.startsWith(' ')) {
    after = after.slice(1);
  }

  return normalizeAttachmentWhitespace(before + after);
}

/** Extracts attachment IDs from `attachment://` references in markdown content. */
export function extractAttachmentIds(content: string): Set<string> {
  const ids = new Set<string>();
  const regex = /attachment:\/\/([a-f0-9-]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

export function replaceAttachmentSource(
  content: string,
  previousSrc: string,
  nextSrc: string
): { content: string; replaced: boolean } {
  const matches = findAttachmentMarkdownMatches(content).filter(
    (match) => match.src === previousSrc
  );

  if (matches.length === 0) {
    return { content, replaced: false };
  }

  let nextContent = content;

  for (const match of matches.reverse()) {
    const replacement = `${match.prefix}[${match.label}](${nextSrc})`;
    nextContent =
      nextContent.slice(0, match.start) +
      replacement +
      nextContent.slice(match.end);
  }

  return {
    content: nextContent,
    replaced: true,
  };
}

export function removeAttachmentMarkdownBySource(
  content: string,
  src: string
): { content: string; removed: boolean } {
  const matches = findAttachmentMarkdownMatches(content).filter(
    (match) => match.src === src
  );

  if (matches.length === 0) {
    return { content, removed: false };
  }

  let nextContent = content;
  for (const match of matches.reverse()) {
    nextContent = removeAttachmentSlice(nextContent, match.start, match.end);
  }

  return { content: nextContent, removed: true };
}
