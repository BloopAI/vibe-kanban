import { useEffect, useMemo, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { FileTagTypeaheadPlugin } from './wysiwyg/plugins/file-tag-typeahead-plugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { EditorState } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { cn } from '@/lib/utils';

export type SerializedEditorState = string;

type WysiwygProps = {
  placeholder: string;
  /** JSON string from `JSON.stringify(editorState.toJSON())` */
  value?: SerializedEditorState;
  onChange?: (state: SerializedEditorState) => void;
  /** Initial JSON string, used only in uncontrolled mode */
  defaultValue?: SerializedEditorState;
  onEditorStateChange?: (s: EditorState) => void;
  disabled?: boolean;
  onPasteFiles?: (files: File[]) => void;
  onFocusChange?: (isFocused: boolean) => void;
  className?: string;
  projectId?: string; // for file search in typeahead
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
  projectId,
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
          ul: 'my-2 ml-6 list-disc space-y-1',
          ol: 'my-2 ml-6 list-decimal space-y-1',
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
  const lastSerializedRef = useRef<SerializedEditorState | undefined>(
    undefined
  );

  // Markdown shortcuts for typing UX (e.g., typing `*` creates bullet lists)
  const markdownShortcuts = TRANSFORMERS;

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
              <div className="absolute top-0 left-0 text-secondary-foreground pointer-events-none">
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>

        <ListPlugin />
        <HistoryPlugin />
        <MarkdownShortcutPlugin transformers={markdownShortcuts} />
        <FileTagTypeaheadPlugin projectId={projectId} />

        {/* Emit JSON on change */}
        <JsonOnChangePlugin
          onSerializedChange={onChange}
          onEditorStateChange={onEditorStateChange}
          lastSerializedRef={lastSerializedRef}
        />

        {/* Apply external controlled value (JSON) */}
        <JsonValuePlugin value={value} lastSerializedRef={lastSerializedRef} />

        {/* Apply defaultValue once in uncontrolled mode */}
        {value === undefined && defaultValue ? (
          <JsonDefaultValuePlugin
            defaultValue={defaultValue}
            lastSerializedRef={lastSerializedRef}
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

function JsonOnChangePlugin({
  onSerializedChange,
  onEditorStateChange,
  lastSerializedRef,
}: {
  onSerializedChange?: (state: SerializedEditorState) => void;
  onEditorStateChange?: (s: EditorState) => void;
  lastSerializedRef: React.MutableRefObject<SerializedEditorState | undefined>;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      onEditorStateChange?.(editorState);

      if (!onSerializedChange) return;

      const json = editorState.toJSON();
      const serialized = JSON.stringify(json);

      if (serialized === lastSerializedRef.current) return;

      lastSerializedRef.current = serialized;
      onSerializedChange(serialized);
    });
  }, [editor, onSerializedChange, onEditorStateChange, lastSerializedRef]);
  return null;
}

function JsonValuePlugin({
  value,
  lastSerializedRef,
}: {
  value?: SerializedEditorState;
  lastSerializedRef: React.MutableRefObject<SerializedEditorState | undefined>;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (value === undefined || value.trim() === '') return;
    if (value === lastSerializedRef.current) return;

    try {
      const editorState = editor.parseEditorState(value);
      editor.setEditorState(editorState);
      lastSerializedRef.current = value;
    } catch (err) {
      console.error('Failed to parse editor state JSON', err);
    }
  }, [editor, value, lastSerializedRef]);
  return null;
}

function JsonDefaultValuePlugin({
  defaultValue,
  lastSerializedRef,
}: {
  defaultValue: SerializedEditorState;
  lastSerializedRef: React.MutableRefObject<SerializedEditorState | undefined>;
}) {
  const [editor] = useLexicalComposerContext();
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    if (defaultValue.trim() === '') return;

    try {
      const editorState = editor.parseEditorState(defaultValue);
      editor.setEditorState(editorState);
      lastSerializedRef.current = defaultValue;
    } catch (err) {
      console.error('Failed to parse default editor state JSON', err);
    }
  }, [editor, defaultValue, lastSerializedRef]);
  return null;
}
