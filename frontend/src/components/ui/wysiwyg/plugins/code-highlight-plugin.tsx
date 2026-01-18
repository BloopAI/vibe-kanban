import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { registerCodeHighlighting, $isCodeNode } from '@lexical/code';
import { $getRoot } from 'lexical';

export function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregister = registerCodeHighlighting(editor);

    // Node transforms registered by registerCodeHighlighting only trigger on
    // future mutations. Force highlighting on pre-existing CodeNodes by marking
    // them dirty, which re-runs the transform and applies syntax highlighting.
    editor.update(() => {
      for (const node of $getRoot().getChildren()) {
        if ($isCodeNode(node)) {
          node.markDirty();
        }
      }
    });

    return unregister;
  }, [editor]);

  return null;
}
