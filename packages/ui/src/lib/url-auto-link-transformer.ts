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
    const linkTextNode = $createTextNode(url);
    linkTextNode.setFormat(textNode.getFormat());
    linkNode.append(linkTextNode);
    textNode.replace(linkNode);
  },
  export: (node) => {
    // If this is a LinkNode where the display text equals the URL,
    // export as a plain URL (preserving original plain-text form).
    if (!$isLinkNode(node)) return null;
    const url = node.getURL();
    const children = node.getChildren();
    if (children.length === 1) {
      const textContent = children[0].getTextContent();
      if (textContent === url) {
        return url;
      }
    }
    return null;
  },
};
