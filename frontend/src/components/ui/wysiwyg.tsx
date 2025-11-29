import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import {
  TRANSFORMERS,
  $convertToMarkdownString,
  $convertFromMarkdownString,
  type Transformer,
} from '@lexical/markdown';
import { ImageNode } from './wysiwyg/nodes/image-node';
import { IMAGE_TRANSFORMER } from './wysiwyg/transformers/image-transformer';
import { CODE_BLOCK_TRANSFORMER } from './wysiwyg/transformers/code-block-transformer';
import { TaskAttemptContext } from './wysiwyg/context/task-attempt-context';
import { FileTagTypeaheadPlugin } from './wysiwyg/plugins/file-tag-typeahead-plugin';
import { KeyboardCommandsPlugin } from './wysiwyg/plugins/keyboard-commands-plugin';
import { ImageKeyboardPlugin } from './wysiwyg/plugins/image-keyboard-plugin';
import { ReadOnlyLinkPlugin } from './wysiwyg/plugins/read-only-link-plugin';
import { ToolbarPlugin } from './wysiwyg/plugins/toolbar-plugin';
import { CodeBlockShortcutPlugin } from './wysiwyg/plugins/code-block-shortcut-plugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { CodeHighlightPlugin } from './wysiwyg/plugins/code-highlight-plugin';
import { LinkNode } from '@lexical/link';
import { EditorState } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Check, Clipboard, Paperclip } from 'lucide-react';
import { writeClipboardViaBridge } from '@/vscode/bridge';

/** Markdown string representing the editor content */
export type SerializedEditorState = string;

type WysiwygProps = {
  placeholder: string;
  /** Markdown string representing the editor content */
  value?: SerializedEditorState;
  onChange?: (state: SerializedEditorState) => void;
  /** Initial markdown string, used only in uncontrolled mode */
  defaultValue?: SerializedEditorState;
  onEditorStateChange?: (s: EditorState) => void;
  disabled?: boolean;
  onPasteFiles?: (files: File[]) => void;
  onFocusChange?: (isFocused: boolean) => void;
  className?: string;
  projectId?: string; // for file search in typeahead
  onCmdEnter?: () => void;
  onShiftCmdEnter?: () => void;
  /** Show copy-to-clipboard button on hover */
  enableCopyButton?: boolean;
  /** Task attempt ID for resolving .vibe-images paths */
  taskAttemptId?: string;
  /** Callback to handle file attachment (upload + insert markdown) */
  onAttachFiles?: (files: File[]) => void;
  /** Show attachment button in bottom-right corner */
  showAttachButton?: boolean;
};

function WYSIWYGEditor({
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
  onCmdEnter,
  onShiftCmdEnter,
  enableCopyButton = false,
  taskAttemptId,
  onAttachFiles,
  showAttachButton = false,
}: WysiwygProps) {
  // Copy button state
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    if (!value) return;
    try {
      await writeClipboardViaBridge(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 400);
    } catch {
      // noop – bridge handles fallback
    }
  }, [value]);

  // Attachment button state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length > 0 && onAttachFiles) {
        onAttachFiles(files);
      }
      // Reset input so same file can be selected again
      e.target.value = '';
    },
    [onAttachFiles]
  );

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
        quote:
          'my-3 border-l-4 border-primary-foreground pl-4 text-muted-foreground',
        list: {
          ul: 'my-1 list-disc list-inside',
          ol: 'my-1 list-decimal list-inside',
          listitem: '',
          nested: {
            listitem: 'pl-4',
          },
        },
        link: 'text-primary underline underline-offset-2 cursor-pointer hover:text-primary/80',
        text: {
          bold: 'font-semibold',
          italic: 'italic',
          underline: 'underline underline-offset-2',
          strikethrough: 'line-through',
          code: 'font-mono bg-muted px-1 py-0.5 rounded',
        },
        code: 'block font-mono text-sm bg-muted rounded-md px-3 py-2 my-2 overflow-x-auto',
        codeHighlight: {
          atrule: 'text-[var(--syntax-keyword)]',
          attr: 'text-[var(--syntax-constant)]',
          boolean: 'text-[var(--syntax-constant)]',
          builtin: 'text-[var(--syntax-variable)]',
          cdata: 'text-[var(--syntax-comment)]',
          char: 'text-[var(--syntax-string)]',
          class: 'text-[var(--syntax-function)]',
          'class-name': 'text-[var(--syntax-function)]',
          comment: 'text-[var(--syntax-comment)] italic',
          constant: 'text-[var(--syntax-constant)]',
          deleted: 'text-[var(--syntax-deleted)]',
          doctype: 'text-[var(--syntax-comment)]',
          entity: 'text-[var(--syntax-function)]',
          function: 'text-[var(--syntax-function)]',
          important: 'text-[var(--syntax-keyword)] font-bold',
          inserted: 'text-[var(--syntax-tag)]',
          keyword: 'text-[var(--syntax-keyword)]',
          namespace: 'text-[var(--syntax-comment)]',
          number: 'text-[var(--syntax-constant)]',
          operator: 'text-[var(--syntax-constant)]',
          prolog: 'text-[var(--syntax-comment)]',
          property: 'text-[var(--syntax-constant)]',
          punctuation: 'text-[var(--syntax-punctuation)]',
          regex: 'text-[var(--syntax-string)]',
          selector: 'text-[var(--syntax-tag)]',
          string: 'text-[var(--syntax-string)]',
          symbol: 'text-[var(--syntax-variable)]',
          tag: 'text-[var(--syntax-tag)]',
          url: 'text-[var(--syntax-constant)]',
          variable: 'text-[var(--syntax-variable)]',
        },
      },
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        CodeNode,
        CodeHighlightNode,
        LinkNode,
        ImageNode,
      ],
    }),
    []
  );

  // Shared ref to avoid update loops and redundant imports
  const lastSerializedRef = useRef<SerializedEditorState | undefined>(
    undefined
  );

  // Extended transformers with image and code block support (memoized to prevent unnecessary re-renders)
  const extendedTransformers: Transformer[] = useMemo(
    () => [IMAGE_TRANSFORMER, CODE_BLOCK_TRANSFORMER, ...TRANSFORMERS],
    []
  );

  const editorContent = (
    <div className="wysiwyg">
      <TaskAttemptContext.Provider value={taskAttemptId}>
        <LexicalComposer initialConfig={initialConfig}>
          <EditablePlugin editable={!disabled} />
          {!disabled && <ToolbarPlugin />}
          <div className="relative">
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={cn(
                    'outline-none text-sm',
                    !disabled && 'min-h-[200px]',
                    className
                  )}
                  aria-label={disabled ? 'Markdown content' : 'Markdown editor'}
                  onPaste={(event) => {
                    if (!onPasteFiles || disabled) return;

                    const dt = event.clipboardData;
                    if (!dt) return;

                    const files: File[] = Array.from(dt.files || []).filter(
                      (f) => f.type.startsWith('image/')
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
                !disabled ? (
                  <div className="absolute top-0 left-0 text-sm text-secondary-foreground pointer-events-none">
                    {placeholder}
                  </div>
                ) : null
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            {/* Attachment button */}
            {showAttachButton && onAttachFiles && !disabled && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={handleAttachClick}
                  className="absolute bottom-2 right-2 p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title="Attach image"
                  aria-label="Attach image"
                >
                  <Paperclip size={16} />
                </button>
              </>
            )}
          </div>

          <ListPlugin />
          <CodeHighlightPlugin />
          {/* Only include editing plugins when not in read-only mode */}
          {!disabled && (
            <>
              <HistoryPlugin />
              <MarkdownShortcutPlugin transformers={extendedTransformers} />
              <FileTagTypeaheadPlugin projectId={projectId} />
              <KeyboardCommandsPlugin
                onCmdEnter={onCmdEnter}
                onShiftCmdEnter={onShiftCmdEnter}
              />
              <ImageKeyboardPlugin />
              <CodeBlockShortcutPlugin />
            </>
          )}
          {/* Link sanitization for read-only mode */}
          {disabled && <ReadOnlyLinkPlugin />}

          {/* Emit markdown on change */}
          <MarkdownOnChangePlugin
            onSerializedChange={onChange}
            onEditorStateChange={onEditorStateChange}
            lastSerializedRef={lastSerializedRef}
            transformers={extendedTransformers}
          />

          {/* Apply external controlled value (markdown) */}
          <MarkdownValuePlugin
            value={value}
            lastSerializedRef={lastSerializedRef}
            transformers={extendedTransformers}
          />

          {/* Apply defaultValue once in uncontrolled mode */}
          {value === undefined && defaultValue ? (
            <MarkdownDefaultValuePlugin
              defaultValue={defaultValue}
              lastSerializedRef={lastSerializedRef}
              transformers={extendedTransformers}
            />
          ) : null}
        </LexicalComposer>
      </TaskAttemptContext.Provider>
    </div>
  );

  // Wrap with copy button if enabled
  if (enableCopyButton) {
    return (
      <div className="relative group">
        <div className="sticky top-2 right-2 z-10 pointer-events-none h-0">
          <div className="flex justify-end pr-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Button
                      type="button"
                      aria-label={copied ? 'Copied!' : 'Copy as Markdown'}
                      title={copied ? 'Copied!' : 'Copy as Markdown'}
                      variant="outline"
                      size="icon"
                      onClick={handleCopy}
                      className="pointer-events-auto opacity-0 group-hover:opacity-100 delay-0 transition-opacity duration-50 h-8 w-8 rounded-md bg-background/95 backdrop-blur border border-border shadow-sm"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Clipboard className="h-4 w-4" />
                      )}
                    </Button>
                    {copied && (
                      <div
                        className="absolute -right-1 mt-1 translate-y-1.5 select-none text-[11px] leading-none px-2 py-1 rounded bg-green-600 text-white shadow pointer-events-none"
                        role="status"
                        aria-live="polite"
                      >
                        Copied
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {copied ? 'Copied!' : 'Copy as Markdown'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        {editorContent}
      </div>
    );
  }

  return editorContent;
}

function EditablePlugin({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);
  return null;
}

function MarkdownOnChangePlugin({
  onSerializedChange,
  onEditorStateChange,
  lastSerializedRef,
  transformers,
}: {
  onSerializedChange?: (state: SerializedEditorState) => void;
  onEditorStateChange?: (s: EditorState) => void;
  lastSerializedRef: React.MutableRefObject<SerializedEditorState | undefined>;
  transformers: Transformer[];
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      onEditorStateChange?.(editorState);

      if (!onSerializedChange) return;

      // Convert editor state to markdown
      const markdown = editorState.read(() =>
        $convertToMarkdownString(transformers)
      );

      if (markdown === lastSerializedRef.current) return;

      lastSerializedRef.current = markdown;
      onSerializedChange(markdown);
    });
  }, [
    editor,
    onSerializedChange,
    onEditorStateChange,
    lastSerializedRef,
    transformers,
  ]);
  return null;
}

function MarkdownValuePlugin({
  value,
  lastSerializedRef,
  transformers,
}: {
  value?: SerializedEditorState;
  lastSerializedRef: React.MutableRefObject<SerializedEditorState | undefined>;
  transformers: Transformer[];
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (value === undefined || value.trim() === '') return;
    if (value === lastSerializedRef.current) return;

    try {
      // Convert markdown to editor state
      editor.update(() => {
        $convertFromMarkdownString(value, transformers);
      });
      lastSerializedRef.current = value;
    } catch (err) {
      console.error('Failed to parse markdown', err);
    }
  }, [editor, value, lastSerializedRef, transformers]);
  return null;
}

function MarkdownDefaultValuePlugin({
  defaultValue,
  lastSerializedRef,
  transformers,
}: {
  defaultValue: SerializedEditorState;
  lastSerializedRef: React.MutableRefObject<SerializedEditorState | undefined>;
  transformers: Transformer[];
}) {
  const [editor] = useLexicalComposerContext();
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    if (defaultValue.trim() === '') return;

    try {
      // Convert markdown to editor state
      editor.update(() => {
        $convertFromMarkdownString(defaultValue, transformers);
      });
      lastSerializedRef.current = defaultValue;
    } catch (err) {
      console.error('Failed to parse default markdown', err);
    }
  }, [editor, defaultValue, lastSerializedRef, transformers]);
  return null;
}

export default memo(WYSIWYGEditor);
