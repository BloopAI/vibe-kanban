import { MultilineElementTransformer } from '@lexical/markdown';
import { $createCodeNode, $isCodeNode, CodeNode } from '@lexical/code';
import { $createTextNode } from 'lexical';

/**
 * Code block transformer for markdown imports (paste operations).
 * Requires both opening and closing ``` to create a code block.
 *
 * For typing detection, see CodeBlockShortcutPlugin.
 */
export const CODE_BLOCK_TRANSFORMER: MultilineElementTransformer = {
  type: 'multiline-element',
  dependencies: [CodeNode],
  regExpStart: /^```([\w-]*)$/,
  regExpEnd: {
    optional: true,
    regExp: /^```$/,
  },
  replace: (
    _rootNode,
    _children,
    startMatch,
    endMatch,
    linesInBetween,
    isImport
  ) => {
    // Only handle imports - typing is handled by CodeBlockShortcutPlugin
    if (!isImport) {
      return false;
    }

    // Require closing backticks for imports
    if (!endMatch) {
      return false;
    }

    const language = startMatch[1] || undefined;
    const codeNode = $createCodeNode(language);

    if (linesInBetween) {
      const code = linesInBetween.join('\n');
      if (code) {
        codeNode.append($createTextNode(code));
      }
    }

    _rootNode.append(codeNode);
  },
  export: (node) => {
    if (!$isCodeNode(node)) {
      return null;
    }
    const textContent = node.getTextContent();
    return (
      '```' +
      (node.getLanguage() || '') +
      (textContent ? '\n' + textContent : '') +
      '\n```'
    );
  },
};
