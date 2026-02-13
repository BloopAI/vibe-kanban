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
