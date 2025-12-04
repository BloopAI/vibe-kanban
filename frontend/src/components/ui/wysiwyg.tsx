import { useMemo, useState, useCallback, memo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS, INLINE_CODE, type Transformer } from '@lexical/markdown';
import { ImageNode } from './wysiwyg/nodes/image-node';
import { InlineCodeNode } from './wysiwyg/nodes/inline-code-node';
import { IMAGE_TRANSFORMER } from './wysiwyg/transformers/image-transformer';
import { CODE_BLOCK_TRANSFORMER } from './wysiwyg/transformers/code-block-transformer';
import { INLINE_CODE_TRANSFORMER } from './wysiwyg/transformers/inline-code-transformer';
import {
  TaskAttemptContext,
  TaskContext,
  LocalImagesContext,
  type LocalImageMetadata,
} from './wysiwyg/context/task-attempt-context';
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
import { CODE_HIGHLIGHT_CLASSES } from './wysiwyg/lib/code-highlight-theme';
import { LinkNode } from '@lexical/link';
import { EditorState } from 'lexical';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check, Clipboard, Pencil, Trash2 } from 'lucide-react';
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
  /** Task attempt ID for resolving .vibe-images paths (preferred over taskId) */
  taskAttemptId?: string;
  /** Task ID for resolving .vibe-images paths when taskAttemptId is not available */
  taskId?: string;
  /** Local images for immediate rendering (before saved to server) */
  localImages?: LocalImageMetadata[];
  /** Optional edit callback - shows edit button in read-only mode when provided */
  onEdit?: () => void;
  /** Optional delete callback - shows delete button in read-only mode when provided */
  onDelete?: () => void;
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
  taskId,
  localImages,
  onEdit,
  onDelete,
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
        code: 'block font-mono bg-secondary rounded-md px-3 py-2 my-2 whitespace-pre overflow-x-auto',
        codeHighlight: CODE_HIGHLIGHT_CLASSES,
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
        InlineCodeNode,
      ],
    }),
    []
  );

  // Extended transformers with image and code block support (memoized to prevent unnecessary re-renders)
  // Filter out default INLINE_CODE to use our custom INLINE_CODE_TRANSFORMER with syntax highlighting
  const extendedTransformers: Transformer[] = useMemo(
    () => [
      IMAGE_TRANSFORMER,
      CODE_BLOCK_TRANSFORMER,
      INLINE_CODE_TRANSFORMER,
      ...TRANSFORMERS.filter((t) => t !== INLINE_CODE),
    ],
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
    <div className="wysiwyg text-sm">
      <TaskAttemptContext.Provider value={taskAttemptId}>
        <TaskContext.Provider value={taskId}>
          <LocalImagesContext.Provider value={localImages ?? []}>
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
                        'outline-none',
                        !disabled && 'min-h-[200px]',
                        className
                      )}
                      aria-label={
                        disabled ? 'Markdown content' : 'Markdown editor'
                      }
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
          </LocalImagesContext.Provider>
        </TaskContext.Provider>
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
              className="pointer-events-auto p-2 bg-muted h-8 w-8"
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Clipboard className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
            {/* Edit button - only if onEdit provided */}
            {onEdit && (
              <Button
                type="button"
                aria-label="Edit"
                title="Edit"
                variant="icon"
                size="icon"
                onClick={onEdit}
                className="pointer-events-auto p-2 bg-muted h-8 w-8"
              >
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
            {/* Delete button - only if onDelete provided */}
            {onDelete && (
              <Button
                type="button"
                aria-label="Delete"
                title="Delete"
                variant="icon"
                size="icon"
                onClick={onDelete}
                className="pointer-events-auto p-2 bg-muted h-8 w-8"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
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
