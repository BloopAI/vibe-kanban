import type { TextMatchTransformer } from '@lexical/markdown';
import { $createLinkNode, $isLinkNode, LinkNode } from '@lexical/link';
import { $createTextNode } from 'lexical';

/**
 * Matches plain http/https URLs that are NOT already inside markdown link
 * syntax (i.e. not preceded by `(` or `[`). Strips common trailing
 * punctuation that is typically not part of the URL.
 */
const URL_IMPORT_REGEX =
  /(?<![(\["])(https?:\/\/[^\s<>\[\]"]*[^\s<>\[\]".,;:!?')}>\]])/; // eslint-disable-line no-useless-escape

const URL_MATCH_REGEX = new RegExp(URL_IMPORT_REGEX.source + '$');

/**
 * Matches GitHub issue/PR/discussion URLs and extracts owner, repo, and number.
 * e.g. https://github.com/skypilot-org/skypilot/pull/8922 → skypilot-org/skypilot#8922
 */
const GITHUB_ISSUE_PR_REGEX =
  /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(?:issues|pull|discussions)\/(\d+)\/?$/;

/**
 * Returns a short display label for GitHub issue/PR/discussion URLs,
 * e.g. `skypilot-org/skypilot#8922`. Returns null for non-GitHub URLs.
 */
function getGitHubShortLabel(url: string): string | null {
  const m = GITHUB_ISSUE_PR_REGEX.exec(url);
  if (!m) return null;
  return `${m[1]}/${m[2]}#${m[3]}`;
}

export const URL_AUTO_LINK_TRANSFORMER: TextMatchTransformer = {
  dependencies: [LinkNode],
  type: 'text-match',
  trigger: ' ',
  importRegExp: URL_IMPORT_REGEX,
  regExp: URL_MATCH_REGEX,
  replace: (textNode, match) => {
    const url = match[1];
    if (!url) return;
    const linkNode = $createLinkNode(url);
    const label = getGitHubShortLabel(url) ?? url;
    const linkTextNode = $createTextNode(label);
    linkTextNode.setFormat(textNode.getFormat());
    linkNode.append(linkTextNode);
    textNode.replace(linkNode);
  },
  export: (node) => {
    // If this is a LinkNode where the display text is the URL itself
    // or a GitHub short label, export as the plain URL.
    if (!$isLinkNode(node)) return null;
    const url = node.getURL();
    const children = node.getChildren();
    if (children.length === 1) {
      const textContent = children[0].getTextContent();
      if (textContent === url || textContent === getGitHubShortLabel(url)) {
        return url;
      }
    }
    return null;
  },
};
