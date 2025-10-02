// Editor.tsx
import { useEffect, useMemo, useState } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { ImageChipNode, InsertImageChipPlugin } from './wysiwyg/ImageChipNode';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'; // <-- default import
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { EditorState } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { IMAGE_CHIP_EXPORT } from './wysiwyg/imageChipMarkdown';

function MarkdownViewer({ onChange }: { onChange: (md: string) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const md = $convertToMarkdownString([
          ...TRANSFORMERS,
          IMAGE_CHIP_EXPORT,
        ]);
        onChange(md);
      });
    });
  }, [editor, onChange]);
  return null;
}

export default function WYSIWYGEditor({
  placeholder,
}: {
  placeholder: string;
}) {
  const [markdown, setMarkdown] = useState('');
  const [editorState, setEditorState] = useState<EditorState | undefined>();

  const initialConfig = useMemo(
    () => ({
      namespace: 'md-wysiwyg',
      onError: console.error,
      theme: {
        heading: { h1: 'text-2xl font-semibold', h2: 'text-xl font-semibold' },
        text: { bold: 'font-bold', italic: 'italic' },
      },
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        CodeNode,
        LinkNode,
        ImageChipNode,
      ],
    }),
    []
  );

  return (
    <div className="wysiwyg">
      <LexicalComposer initialConfig={initialConfig}>
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="min-h-[200px] outline-none"
                aria-label="Markdown editor"
              />
            }
            placeholder={
              <div className="absolute top-0 left-0 text-gray-400 pointer-events-none">
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <InsertImageChipPlugin />
        {/* capture both JSON (if you still want it) and Markdown */}
        <MarkdownViewer onChange={setMarkdown} />
        {/* keep your existing state tap if useful */}
        <MyOnChangePlugin onChange={setEditorState} />
      </LexicalComposer>

      {/* Markdown preview */}
      {/* <div className="border rounded-xl p-3 mt-3 whitespace-pre-wrap font-mono text-sm">
                {markdown || "_(Markdown will appear here as you type)_"}
            </div> */}
    </div>
  );
}

// unchanged
function MyOnChangePlugin({
  onChange,
}: {
  onChange: (s: EditorState) => void;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => onChange(editorState)),
    [editor, onChange]
  );
  return null;
}
