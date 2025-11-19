import { useEffect, useMemo, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import {
  $convertToMarkdownString,
  $convertFromMarkdownString,
  TRANSFORMERS,
  type Transformer,
} from '@lexical/markdown';
import {
  ImageChipNode,
  InsertImageChipPlugin,
} from './wysiwyg/image-chip-node';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { EditorState } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  IMAGE_CHIP_EXPORT,
  IMAGE_CHIP_IMPORT,
} from './wysiwyg/image-chip-markdown';

type WysiwygProps = {
  placeholder: string;
  value?: string; // controlled markdown
  onChange?: (md: string) => void;
  defaultValue?: string; // uncontrolled initial markdown
  onEditorStateChange?: (s: EditorState) => void;
};

export default function WYSIWYGEditor({
  placeholder,
  value,
  onChange,
  defaultValue,
  onEditorStateChange,
}: WysiwygProps) {
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

  // Shared ref to avoid update loops and redundant imports
  const lastMdRef = useRef<string>('');

  const exportTransformers: Transformer[] = useMemo(
    () => [...TRANSFORMERS, IMAGE_CHIP_EXPORT],
    []
  );
  const importTransformers: Transformer[] = useMemo(
    () => [...TRANSFORMERS, IMAGE_CHIP_IMPORT],
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

        <ListPlugin />
        <HistoryPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <InsertImageChipPlugin />

        {/* Emit markdown on change */}
        <MarkdownOnChangePlugin
          onMarkdownChange={onChange}
          onEditorStateChange={onEditorStateChange}
          exportTransformers={exportTransformers}
          lastMdRef={lastMdRef}
        />

        {/* Apply external controlled value (markdown) */}
        <MarkdownValuePlugin
          value={value}
          importTransformers={importTransformers}
          lastMdRef={lastMdRef}
        />

        {/* Apply defaultValue once in uncontrolled mode */}
        {value === undefined && defaultValue ? (
          <MarkdownDefaultValuePlugin
            defaultValue={defaultValue}
            importTransformers={importTransformers}
            lastMdRef={lastMdRef}
          />
        ) : null}
      </LexicalComposer>
    </div>
  );
}

function MarkdownOnChangePlugin({
  onMarkdownChange,
  onEditorStateChange,
  exportTransformers,
  lastMdRef,
}: {
  onMarkdownChange?: (md: string) => void;
  onEditorStateChange?: (s: EditorState) => void;
  exportTransformers: Transformer[];
  lastMdRef: React.MutableRefObject<string>;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      // Tap editor state if requested
      if (onEditorStateChange) {
        onEditorStateChange(editorState);
      }
      // Emit markdown
      editorState.read(() => {
        const md = $convertToMarkdownString(exportTransformers);
        lastMdRef.current = md;
        if (onMarkdownChange) onMarkdownChange(md);
      });
    });
  }, [
    editor,
    onMarkdownChange,
    onEditorStateChange,
    exportTransformers,
    lastMdRef,
  ]);
  return null;
}

function MarkdownValuePlugin({
  value,
  importTransformers,
  lastMdRef,
}: {
  value?: string;
  importTransformers: Transformer[];
  lastMdRef: React.MutableRefObject<string>;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (value === undefined) return; // uncontrolled mode
    if (value === lastMdRef.current) return; // avoid redundant imports

    editor.update(() => {
      // Replace content with external value
      $convertFromMarkdownString(value || '', importTransformers);
    });
    lastMdRef.current = value || '';
  }, [editor, value, importTransformers, lastMdRef]);
  return null;
}

function MarkdownDefaultValuePlugin({
  defaultValue,
  importTransformers,
  lastMdRef,
}: {
  defaultValue: string;
  importTransformers: Transformer[];
  lastMdRef: React.MutableRefObject<string>;
}) {
  const [editor] = useLexicalComposerContext();
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    editor.update(() => {
      $convertFromMarkdownString(defaultValue || '', importTransformers);
    });
    lastMdRef.current = defaultValue || '';
  }, [editor, defaultValue, importTransformers, lastMdRef]);
  return null;
}
