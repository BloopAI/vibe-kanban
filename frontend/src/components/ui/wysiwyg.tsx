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
} from '@lexical/markdown';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { EditorState } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { cn } from '@/lib/utils';

type WysiwygProps = {
  placeholder: string;
  value?: string; // controlled markdown
  onChange?: (md: string) => void;
  defaultValue?: string; // uncontrolled initial markdown
  onEditorStateChange?: (s: EditorState) => void;
  disabled?: boolean;
  onPasteFiles?: (files: File[]) => void;
  onFocusChange?: (isFocused: boolean) => void;
  className?: string;
};

export default function WYSIWYGEditor({
  placeholder,
  value,
  onChange,
  defaultValue,
  onEditorStateChange,
  disabled = false,
  onPasteFiles,
  onFocusChange,
  className,
}: WysiwygProps) {
  const initialConfig = useMemo(
    () => ({
      namespace: 'md-wysiwyg',
      onError: console.error,
      theme: {
        paragraph: 'mb-2 last:mb-0',
        heading: {
          h1: 'mt-4 mb-2 text-2xl font-semibold',
          h2: 'mt-3 mb-2 text-xl font-semibold',
          h3: 'mt-3 mb-2 text-lg font-semibold',
          h4: 'mt-2 mb-1 text-base font-medium',
          h5: 'mt-2 mb-1 text-sm font-medium',
          h6: 'mt-2 mb-1 text-xs font-medium uppercase tracking-wide',
        },
        quote: 'my-3 border-l-2 border-muted pl-3 text-muted-foreground italic',
        list: {
          ul: 'my-2 ml-5 list-disc space-y-1',
          ol: 'my-2 ml-5 list-decimal space-y-1',
          listitem: 'ml-1',
          nested: {
            listitem: 'ml-4 list-none',
          },
        },
        link: 'text-primary underline underline-offset-2 cursor-pointer hover:text-primary/80',
        text: {
          bold: 'font-semibold',
          italic: 'italic',
          underline: 'underline underline-offset-2',
          strikethrough: 'line-through',
          code: 'font-mono text-xs bg-muted px-1 py-0.5 rounded',
        },
        code: 'block font-mono text-xs bg-muted rounded-md px-3 py-2 my-2 overflow-x-auto',
      },
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        CodeNode,
        LinkNode,
      ],
    }),
    []
  );

  // Shared ref to avoid update loops and redundant imports
  const lastMdRef = useRef<string>('');

  // Basic markdown support using Lexical's built-in TRANSFORMERS.
  // Note: image markdown (e.g. ![alt](src)) is treated as plain text.
  const markdownTransformers = TRANSFORMERS;

  return (
    <div className="wysiwyg">
      <LexicalComposer initialConfig={initialConfig}>
        <EditablePlugin editable={!disabled} />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={cn(
                  'min-h-[200px] outline-none text-base leading-relaxed',
                  disabled && 'cursor-not-allowed opacity-70',
                  className
                )}
                aria-label="Markdown editor"
                onPaste={(event) => {
                  if (!onPasteFiles) return;

                  const dt = event.clipboardData;
                  if (!dt) return;

                  const files: File[] = Array.from(dt.files || []).filter((f) =>
                    f.type.startsWith('image/')
                  );

                  if (files.length > 0) {
                    onPasteFiles(files);
                  }
                }}
                onFocus={() => onFocusChange?.(true)}
                onBlur={() => onFocusChange?.(false)}
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
        <MarkdownShortcutPlugin transformers={markdownTransformers} />

        {/* Emit markdown on change */}
        <MarkdownOnChangePlugin
          onMarkdownChange={onChange}
          onEditorStateChange={onEditorStateChange}
          exportTransformers={markdownTransformers}
          lastMdRef={lastMdRef}
        />

        {/* Apply external controlled value (markdown) */}
        <MarkdownValuePlugin
          value={value}
          importTransformers={markdownTransformers}
          lastMdRef={lastMdRef}
        />

        {/* Apply defaultValue once in uncontrolled mode */}
        {value === undefined && defaultValue ? (
          <MarkdownDefaultValuePlugin
            defaultValue={defaultValue}
            importTransformers={markdownTransformers}
            lastMdRef={lastMdRef}
          />
        ) : null}
      </LexicalComposer>
    </div>
  );
}

function EditablePlugin({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);
  return null;
}

function MarkdownOnChangePlugin({
  onMarkdownChange,
  onEditorStateChange,
  exportTransformers,
  lastMdRef,
}: {
  onMarkdownChange?: (md: string) => void;
  onEditorStateChange?: (s: EditorState) => void;
  exportTransformers: typeof TRANSFORMERS;
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
  importTransformers: typeof TRANSFORMERS;
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
  importTransformers: typeof TRANSFORMERS;
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
