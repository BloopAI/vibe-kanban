import { TextMatchTransformer } from '@lexical/markdown';
import {
  $createInlineCodeNode,
  $isInlineCodeNode,
  InlineCodeNode,
} from '../nodes/inline-code-node';

export const INLINE_CODE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [InlineCodeNode],
  export: (node) => {
    if ($isInlineCodeNode(node)) {
      return '`' + node.getCode() + '`';
    }
    return null;
  },
  // Match backtick-wrapped code during import (paste)
  importRegExp: /`([^`]+)`/,
  // Match at end of line while typing
  regExp: /`([^`]+)`$/,
  replace: (textNode, match) => {
    const [, code] = match;
    const inlineCodeNode = $createInlineCodeNode(code);
    textNode.replace(inlineCodeNode);
  },
  trigger: '`',
  type: 'text-match',
};
