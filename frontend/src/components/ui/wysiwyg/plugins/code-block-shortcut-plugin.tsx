import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { $createCodeNode } from '@lexical/code';
import { TextNode, $isParagraphNode } from 'lexical';

/**
 * Plugin that detects triple backticks (```) and converts the paragraph to a code block.
 * Supports optional language hints like ```javascript or ```python
 */
export function CodeBlockShortcutPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(TextNode, (textNode) => {
      const text = textNode.getTextContent();

      // Check if text starts with ``` (with optional language hint)
      if (!text.startsWith('```')) {
        return;
      }

      const parent = textNode.getParent();
      if (!$isParagraphNode(parent)) {
        return;
      }

      // Get optional language hint after backticks (e.g., ```javascript)
      const langMatch = text.match(/^```(\w*)/);
      const language = langMatch?.[1] || undefined;

      // Create code node with optional language
      const codeNode = $createCodeNode(language);

      // Replace paragraph with code node
      parent.replace(codeNode);

      // Position cursor inside code block
      codeNode.selectEnd();
    });
  }, [editor]);

  return null;
}
