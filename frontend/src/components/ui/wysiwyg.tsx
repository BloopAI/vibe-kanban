import { useMemo, useState, useCallback, memo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS, type Transformer } from '@lexical/markdown';
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
import { MarkdownSyncPlugin } from './wysiwyg/plugins/markdown-sync-plugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { CodeHighlightPlugin } from './wysiwyg/plugins/code-highlight-plugin';
import { LinkNode } from '@lexical/link';
import { EditorState } from 'lexical';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check, Clipboard, Pencil } from 'lucide-react';
import { writeClipboardViaBridge } from '@/vscode/bridge';

/** Markdown string representing the editor content */
export type SerializedEditorState = string;

type WysiwygProps = {
  placeholder?: string;
  /** Markdown string representing the editor content */
  value: SerializedEditorState;
  onChange?: (state: SerializedEditorState) => void;
  onEditorStateChange?: (s: EditorState) => void;
  disabled?: boolean;
  onPasteFiles?: (files: File[]) => void;
  className?: string;
  projectId?: string; // for file search in typeahead
  onCmdEnter?: () => void;
  onShiftCmdEnter?: () => void;
  /** Task attempt ID for resolving .vibe-images paths */
  taskAttemptId?: string;
  /** Optional retry callback - shows edit button in read-only mode when provided */
  onRetry?: () => void;
};

function WYSIWYGEditor({
  placeholder = '',
  value,
  onChange,
  onEditorStateChange,
  disabled = false,
  onPasteFiles,
  className,
  projectId,
  onCmdEnter,
  onShiftCmdEnter,
  taskAttemptId,
  onRetry,
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
        code: 'block font-mono text-sm bg-muted rounded-md px-3 py-2 my-2 whitespace-pre overflow-x-auto',
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

  // Extended transformers with image and code block support (memoized to prevent unnecessary re-renders)
  const extendedTransformers: Transformer[] = useMemo(
    () => [IMAGE_TRANSFORMER, CODE_BLOCK_TRANSFORMER, ...TRANSFORMERS],
    []
  );

  // Memoized handlers for ContentEditable to prevent re-renders
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      if (!onPasteFiles || disabled) return;

      const dt = event.clipboardData;
      if (!dt) return;

      const files: File[] = Array.from(dt.files || []).filter((f) =>
        f.type.startsWith('image/')
      );

      if (files.length > 0) {
        onPasteFiles(files);
      }
    },
    [onPasteFiles, disabled]
  );

  // Memoized placeholder element
  const placeholderElement = useMemo(
    () =>
      !disabled ? (
        <div className="absolute top-0 left-0 text-sm text-secondary-foreground pointer-events-none">
          {placeholder}
        </div>
      ) : null,
    [disabled, placeholder]
  );

  const editorContent = (
    <div className="wysiwyg">
      <TaskAttemptContext.Provider value={taskAttemptId}>
        <LexicalComposer initialConfig={initialConfig}>
          <MarkdownSyncPlugin
            value={value}
            onChange={onChange}
            onEditorStateChange={onEditorStateChange}
            editable={!disabled}
            transformers={extendedTransformers}
          />
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
                  onPaste={handlePaste}
                />
              }
              placeholder={placeholderElement}
              ErrorBoundary={LexicalErrorBoundary}
            />
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
        </LexicalComposer>
      </TaskAttemptContext.Provider>
    </div>
  );

  // Wrap with action buttons in read-only mode
  if (disabled) {
    return (
      <div className="relative group">
        <div className="sticky top-0 right-2 z-10 pointer-events-none h-0">
          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {/* Copy button */}
            <Button
              type="button"
              aria-label={copied ? 'Copied!' : 'Copy as Markdown'}
              title={copied ? 'Copied!' : 'Copy as Markdown'}
              variant="icon"
              size="icon"
              onClick={handleCopy}
              className="pointer-events-auto p-2 bg-foreground h-8 w-8"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Clipboard className="w-4 h-4 text-background" />
              )}
            </Button>
            {/* Retry button - only if onRetry provided */}
            {onRetry && (
              <Button
                type="button"
                aria-label="Edit message"
                title="Edit message"
                variant="icon"
                size="icon"
                onClick={onRetry}
                className="pointer-events-auto p-2 bg-foreground h-8 w-8"
              >
                <Pencil className="w-4 h-4 text-background" />
              </Button>
            )}
          </div>
        </div>
        {editorContent}
      </div>
    );
  }

  return editorContent;
}

export default memo(WYSIWYGEditor);
