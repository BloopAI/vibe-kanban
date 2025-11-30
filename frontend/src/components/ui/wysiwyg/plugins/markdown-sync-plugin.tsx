import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $convertToMarkdownString,
  $convertFromMarkdownString,
  type Transformer,
} from '@lexical/markdown';
import { $getRoot, type EditorState } from 'lexical';

type MarkdownSyncPluginProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (markdown: string) => void;
  onEditorStateChange?: (state: EditorState) => void;
  editable: boolean;
  transformers: Transformer[];
};

/**
 * Handles bidirectional markdown synchronization between Lexical editor and external state.
 *
 * This plugin consolidates all markdown sync logic:
 * - Controlled mode: syncs `value` prop to/from editor
 * - Uncontrolled mode: applies `defaultValue` once on mount
 * - Editable state management
 *
 * Uses an internal ref to prevent infinite update loops during bidirectional sync.
 */
export function MarkdownSyncPlugin({
  value,
  defaultValue,
  onChange,
  onEditorStateChange,
  editable,
  transformers,
}: MarkdownSyncPluginProps) {
  const [editor] = useLexicalComposerContext();
  const lastSerializedRef = useRef<string | undefined>(undefined);
  const didInitRef = useRef(false);

  // Handle editable state
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);

  // Handle defaultValue (uncontrolled mode) - run once
  useEffect(() => {
    if (value !== undefined || didInitRef.current) return;
    didInitRef.current = true;
    if (!defaultValue?.trim()) return;

    try {
      editor.update(() => {
        $convertFromMarkdownString(defaultValue, transformers);
      });
      lastSerializedRef.current = defaultValue;
    } catch (err) {
      console.error('Failed to parse default markdown', err);
    }
  }, [editor, defaultValue, value, transformers]);

  // Handle controlled value changes (external → editor)
  useEffect(() => {
    if (value === undefined) return;
    if (value === lastSerializedRef.current) return;

    try {
      editor.update(() => {
        if (value.trim() === '') {
          $getRoot().clear();
        } else {
          $convertFromMarkdownString(value, transformers);
        }
      });
      lastSerializedRef.current = value;
    } catch (err) {
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
      if (markdown === lastSerializedRef.current) return;

      lastSerializedRef.current = markdown;
      onChange(markdown);
    });
  }, [editor, onChange, onEditorStateChange, transformers]);

  return null;
}
