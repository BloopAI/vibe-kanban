/**
 * Preprocesses markdown content to convert GitHub-style issue/PR references
 * (`#123`, `owner/repo#123`) into clickable markdown links.
 *
 * The `owner/repo` context is inferred from full GitHub URLs found in the
 * same markdown content, so no backend changes are needed.
 */

/** Matches full GitHub URLs to extract owner/repo */
const GITHUB_URL_REGEX =
  /https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g;

/**
 * Matches `#123` or `owner/repo#123` references that should be linkified.
 *
 * Negative lookbehind prevents matching:
 * - `[#123` — already part of a markdown link text
 * - `(#123` — already part of a markdown link URL or anchor
 * - `` `#123 `` — inside inline code (backtick)
 * - `/#123` — URL path segment (like /issues/123)
 * - `&#123;` — HTML entities
 * - `\w#123` — attached to a word (e.g. CSS color #fff, C# etc.)
 */
const ISSUE_REF_REGEX =
  /(?<![[()`\/&\w])(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#(\d{1,10})(?!\d)(?![^\[]*\])/g; // eslint-disable-line no-useless-escape

/**
 * Extracts the most commonly referenced `owner/repo` from GitHub URLs
 * found in the markdown content.
 */
function extractGitHubRepo(markdown: string): string | null {
  const counts = new Map<string, number>();
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  GITHUB_URL_REGEX.lastIndex = 0;
  while ((match = GITHUB_URL_REGEX.exec(markdown)) !== null) {
    const repo = match[1].toLowerCase();
    counts.set(repo, (counts.get(repo) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  // Return the repo with the highest count (original case from first match)
  let bestRepo: string | null = null;
  let bestCount = 0;
  for (const [repo, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestRepo = repo;
    }
  }

  // Re-scan to get the original-case version
  if (bestRepo) {
    GITHUB_URL_REGEX.lastIndex = 0;
    while ((match = GITHUB_URL_REGEX.exec(markdown)) !== null) {
      if (match[1].toLowerCase() === bestRepo) {
        return match[1];
      }
    }
  }

  return bestRepo;
}

/**
 * Checks whether a position in the markdown is inside a fenced code block.
 * Pre-computes code block ranges for efficient lookup.
 */
function buildCodeBlockRanges(markdown: string): [number, number][] {
  const ranges: [number, number][] = [];
  const fencedCodeRegex = /^(`{3,}|~{3,}).*\n[\s\S]*?^(\1)/gm;
  let match: RegExpExecArray | null;
  while ((match = fencedCodeRegex.exec(markdown)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function isInsideCodeBlock(
  pos: number,
  ranges: [number, number][]
): boolean {
  for (const [start, end] of ranges) {
    if (pos >= start && pos < end) return true;
    if (start > pos) break; // ranges are sorted
  }
  return false;
}

/**
 * Checks whether a position is inside an inline code span (backticks).
 */
function isInsideInlineCode(pos: number, markdown: string): boolean {
  const inlineCodeRegex = /`[^`]*`/g;
  let match: RegExpExecArray | null;
  while ((match = inlineCodeRegex.exec(markdown)) !== null) {
    if (pos >= match.index && pos < match.index + match[0].length) {
      return true;
    }
    if (match.index > pos) break;
  }
  return false;
}

/**
 * Preprocesses markdown to convert `#123` and `owner/repo#123` references
 * into clickable GitHub links.
 *
 * @param markdown - The raw markdown content
 * @returns The markdown with issue/PR references converted to links
 */
export function linkifyGitHubRefs(markdown: string): string {
  const defaultRepo = extractGitHubRepo(markdown);

  // If there are no GitHub URLs in the content, there's nothing to link
  // (we can't know what repo `#123` refers to)
  if (!defaultRepo) return markdown;

  const codeBlockRanges = buildCodeBlockRanges(markdown);

  // Reset lastIndex for global regex
  ISSUE_REF_REGEX.lastIndex = 0;

  return markdown.replace(ISSUE_REF_REGEX, (fullMatch, repoRef, number, offset) => {
    // Skip references inside code blocks or inline code
    if (isInsideCodeBlock(offset, codeBlockRanges)) return fullMatch;
    if (isInsideInlineCode(offset, markdown)) return fullMatch;

    const repo = repoRef || defaultRepo;
    const num = number;

    // GitHub's /issues/N URL automatically redirects to /pull/N for PRs
    return `[${fullMatch}](https://github.com/${repo}/issues/${num})`;
  });
}
