import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $convertToMarkdownString,
  $convertFromMarkdownString,
  type Transformer,
} from '@lexical/markdown';
import { $getRoot, type EditorState } from 'lexical';

const DEBUG_PREFIX = '[WYSIWYG_DEBUG]';

function debugLog(message: string, payload?: unknown) {
  if (!import.meta.env.DEV) return;
  if (payload === undefined) {
    console.log(DEBUG_PREFIX, message);
    return;
  }
  console.log(DEBUG_PREFIX, message, payload);
}

type MarkdownSyncPluginProps = {
  value: string;
  onChange?: (markdown: string) => void;
  onEditorStateChange?: (state: EditorState) => void;
  editable: boolean;
  transformers: Transformer[];
};

/**
 * Handles bidirectional markdown synchronization between Lexical editor and external state.
 *
 * Uses an internal ref to prevent infinite update loops during bidirectional sync.
 */
export function MarkdownSyncPlugin({
  value,
  onChange,
  onEditorStateChange,
  editable,
  transformers,
}: MarkdownSyncPluginProps) {
  const [editor] = useLexicalComposerContext();
  const lastSerializedRef = useRef<string | undefined>(undefined);

  // Handle editable state
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);

  // Handle controlled value changes (external → editor)
  useEffect(() => {
    if (value === lastSerializedRef.current) {
      debugLog('markdown-sync: skip external->editor (value unchanged)', {
        valueLength: value.length,
      });
      return;
    }

    debugLog('markdown-sync: begin external->editor', {
      valueLength: value.length,
      valuePreview: value.slice(0, 120),
    });

    try {
      editor.update(() => {
        if (value.trim() === '') {
          $getRoot().clear();
        } else {
          $convertFromMarkdownString(value, transformers);
        }

        // Only position cursor at end if editor already has focus (user is actively editing)
        // This prevents unwanted focus when value changes externally (e.g., panel opening)
        const rootElement = editor.getRootElement();
        if (rootElement?.contains(document.activeElement)) {
          const root = $getRoot();
          const lastNode = root.getLastChild();
          if (lastNode) {
            lastNode.selectEnd();
          }
        }

        const root = $getRoot();
        debugLog('markdown-sync: applied external->editor update', {
          rootChildren: root.getChildren().map((node) => ({
            key: node.getKey(),
            type: node.getType(),
            textPreview: node.getTextContent().slice(0, 60),
          })),
        });
      });
      lastSerializedRef.current = value;
    } catch (err) {
      debugLog('markdown-sync: external->editor failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      console.error('Failed to parse markdown', err);
    }
  }, [editor, value, transformers]);

  // Handle editor changes (editor → external)
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      onEditorStateChange?.(editorState);
      if (!onChange) return;

      const markdown = editorState.read(() =>
        $convertToMarkdownString(transformers)
      );
      if (markdown === lastSerializedRef.current) {
        debugLog('markdown-sync: skip editor->external (markdown unchanged)', {
          markdownLength: markdown.length,
        });
        return;
      }

      debugLog('markdown-sync: emit editor->external update', {
        markdownLength: markdown.length,
        markdownPreview: markdown.slice(0, 120),
      });
      lastSerializedRef.current = markdown;
      onChange(markdown);
    });
  }, [editor, onChange, onEditorStateChange, transformers]);

  return null;
}
