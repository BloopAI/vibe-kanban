import {
  useMemo,
  useState,
  useCallback,
  useContext,
  memo,
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { TRANSFORMERS, type Transformer } from '@lexical/markdown';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { CodeBlockEscapePlugin } from '@vibe/ui/components/CodeBlockEscapePlugin';
import { InlineCodeBoundaryPlugin } from '@vibe/ui/components/InlineCodeBoundaryPlugin';
import {
  PrCommentNode,
  PR_COMMENT_TRANSFORMER,
  PR_COMMENT_EXPORT_TRANSFORMER,
} from '@vibe/ui/components/pr-comment-node';
import { createImageNode } from '@vibe/ui/components/image-node';
import { createAttachmentNode } from '@vibe/ui/components/attachment-node';
import {
  ComponentInfoNode,
  COMPONENT_INFO_TRANSFORMER,
  COMPONENT_INFO_EXPORT_TRANSFORMER,
  $isComponentInfoNode,
} from '@vibe/ui/components/component-info-node';
import { TABLE_TRANSFORMER } from '@vibe/ui/lib/table-transformer';
import {
  WorkspaceContext as EditorWorkspaceContext,
  SessionContext,
  LocalAttachmentsContext,
  type LocalAttachmentMetadata,
} from '@vibe/ui/components/WorkspaceContext';
import { TypeaheadOpenProvider } from '@vibe/ui/components/TypeaheadOpenContext';
import {
  FileTagTypeaheadPlugin,
  type RepoLike,
  type SearchResultItemLike,
} from '@vibe/ui/components/FileTagTypeaheadPlugin';
import { SlashCommandTypeaheadPlugin } from '@vibe/ui/components/SlashCommandTypeaheadPlugin';
import { KeyboardCommandsPlugin } from '@vibe/ui/components/KeyboardCommandsPlugin';
import { ImageKeyboardPlugin } from '@vibe/ui/components/ImageKeyboardPlugin';
import { ComponentInfoKeyboardPlugin } from '@vibe/ui/components/ComponentInfoKeyboardPlugin';
import { ReadOnlyLinkPlugin } from '@vibe/ui/components/ReadOnlyLinkPlugin';
import { ClickableCodePlugin } from '@vibe/ui/components/ClickableCodePlugin';
import { ToolbarPlugin } from '@vibe/ui/components/ToolbarPlugin';
import { StaticToolbarPlugin } from '@vibe/ui/components/StaticToolbarPlugin';
import { PasteMarkdownPlugin } from '@vibe/ui/components/PasteMarkdownPlugin';
import { MarkdownSyncPlugin } from '@vibe/ui/components/MarkdownSyncPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { CodeHighlightPlugin } from '@vibe/ui/components/CodeHighlightPlugin';
import { CODE_HIGHLIGHT_CLASSES } from '@vibe/ui/lib/code-highlight-theme';
import { LinkNode } from '@lexical/link';
import { TableNode, TableRowNode, TableCellNode } from '@lexical/table';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { type EditorState, type LexicalEditor } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { WorkspaceDiffContext } from '@/shared/hooks/useWorkspaceContext';
import { useSlashCommands } from '@/shared/hooks/useExecutorDiscovery';
import { useUiPreferencesStore } from '@/shared/stores/useUiPreferencesStore';
import { cn } from '@/shared/lib/utils';
import { repoApi } from '@/shared/lib/api';
import { searchTagsAndFiles } from '@/shared/lib/searchTagsAndFiles';
import { Button } from '@vibe/ui/components/Button';
import { Check, Clipboard, Pencil, Trash2 } from 'lucide-react';
import type { RepoItem } from '@/shared/types/selectionItems';
import { TagEditDialog } from '@/shared/dialogs/shared/TagEditDialog';
import { ImagePreviewDialog } from '@/shared/dialogs/wysiwyg/ImagePreviewDialog';
import {
  SelectionDialog,
  type SelectionPage,
} from '@/shared/dialogs/command-bar/SelectionDialog';
import {
  buildRepoSelectionPages,
  type RepoSelectionResult,
} from '@/shared/dialogs/command-bar/selections/repoSelection';
import { fetchAttachmentSasUrl } from '@/shared/lib/remoteApi';
import { writeClipboardViaBridge } from '@/shared/lib/clipboard';
import type { SendMessageShortcut } from 'shared/types';
import type { BaseCodingAgent } from 'shared/types';

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
  /** Repo IDs for file search in typeahead */
  repoIds?: string[];
  /** Enables `/` command autocomplete (agent-specific). */
  executor?: BaseCodingAgent | null;
  onCmdEnter?: () => void;
  onShiftCmdEnter?: () => void;
  /** Keyboard shortcut mode for sending messages */
  sendShortcut?: SendMessageShortcut;
  /** Task attempt ID for resolving .vibe-attachments paths */
  workspaceId?: string;
  /** Session ID used for workspace-scoped APIs (attachments, slash command discovery) */
  sessionId?: string;
  /** Repo ID for slash commands when no workspace yet */
  repoId?: string;
  /** Local attachments for immediate rendering (before saved to server) */
  localAttachments?: LocalAttachmentMetadata[];
  /** Optional edit callback - shows edit button in read-only mode when provided */
  onEdit?: () => void;
  /** Optional delete callback - shows delete button in read-only mode when provided */
  onDelete?: () => void;
  /** Auto-focus the editor on mount */
  autoFocus?: boolean;
  /** Function to find a matching diff path for clickable inline code (only in read-only mode) */
  findMatchingDiffPath?: (text: string) => string | null;
  /** Callback when clickable inline code is clicked (only in read-only mode) */
  onCodeClick?: (fullPath: string) => void;
  /** Hide the copy/edit/delete action buttons in read-only mode */
  hideActions?: boolean;
  /** Show a static toolbar below the editor content */
  showStaticToolbar?: boolean;
  /** Save status indicator for static toolbar */
  saveStatus?: 'idle' | 'saved';
  /** Additional actions to render in static toolbar */
  staticToolbarActions?: ReactNode;
  /** Called when a toolbar button is clicked in preview mode to request edit */
  onRequestEdit?: () => void;
};

/** Ref interface for WYSIWYGEditor, exposing imperative methods */
export interface WYSIWYGEditorRef {
  /** Focus the editor */
  focus: () => void;
}

const GENERIC_CLIPBOARD_IMAGE_BASE_NAMES = new Set([
  'image',
  'output',
  'clipboard',
  'pasted-image',
  'screenshot',
]);
const MAX_CLIPBOARD_PASTED_FILES = 10;

function getImageMimePriority(mimeType: string): number {
  if (mimeType === 'image/png') return 5;
  if (mimeType === 'image/webp') return 4;
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 3;
  if (mimeType === 'image/gif') return 2;
  return 1;
}

function isGenericClipboardImageName(fileName: string): boolean {
  const baseName = fileName
    .replace(/\.[^.]+$/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  return GENERIC_CLIPBOARD_IMAGE_BASE_NAMES.has(baseName);
}

function dedupeClipboardFiles(files: File[]): File[] {
  if (files.length <= 1) {
    return files;
  }

  const uniqueByMetadata: File[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueByMetadata.push(file);
  }

  if (uniqueByMetadata.length <= 1) {
    return uniqueByMetadata;
  }

  const imageFiles = uniqueByMetadata.filter((f) =>
    f.type.startsWith('image/')
  );
  const nonImageFiles = uniqueByMetadata.filter(
    (f) => !f.type.startsWith('image/')
  );

  if (nonImageFiles.length > 0 || imageFiles.length <= 1) {
    return uniqueByMetadata.slice(0, MAX_CLIPBOARD_PASTED_FILES);
  }

  const nonGenericImageFiles = imageFiles.filter(
    (f) => !isGenericClipboardImageName(f.name)
  );

  if (imageFiles.length >= 3 && nonGenericImageFiles.length === 1) {
    return [nonGenericImageFiles[0]];
  }

  if (imageFiles.length >= 3 && nonGenericImageFiles.length === 0) {
    const [preferredImage] = [...imageFiles].sort((a, b) => {
      const priorityDiff =
        getImageMimePriority(b.type) - getImageMimePriority(a.type);
      if (priorityDiff !== 0) return priorityDiff;
      return b.size - a.size;
    });

    return preferredImage ? [preferredImage] : uniqueByMetadata;
  }

  return uniqueByMetadata.slice(0, MAX_CLIPBOARD_PASTED_FILES);
}

function getRepoDisplayName(repo: RepoLike): string {
  return repo.display_name || repo.name;
}

function toRepoItem(repo: RepoLike): RepoItem {
  return {
    id: repo.id,
    display_name: getRepoDisplayName(repo),
  };
}

/** Plugin to capture the Lexical editor instance into a ref */
function EditorRefPlugin({
  editorRef,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editorRef.current = editor;
  }, [editor, editorRef]);
  return null;
}

const WYSIWYGEditor = forwardRef<WYSIWYGEditorRef, WysiwygProps>(
  function WYSIWYGEditor(
    {
      placeholder = '',
      value,
      onChange,
      onEditorStateChange,
      disabled = false,
      onPasteFiles,
      className,
      repoIds,
      executor = null,
      onCmdEnter,
      onShiftCmdEnter,
      sendShortcut,
      workspaceId,
      sessionId,
      repoId,
      localAttachments,
      onEdit,
      onDelete,
      autoFocus = false,
      findMatchingDiffPath,
      onCodeClick,
      hideActions = false,
      showStaticToolbar = false,
      saveStatus,
      staticToolbarActions,
      onRequestEdit,
    }: WysiwygProps,
    ref: React.ForwardedRef<WYSIWYGEditorRef>
  ) {
    // Ref to capture the Lexical editor instance for imperative methods
    const editorInstanceRef = useRef<LexicalEditor | null>(null);

    // Expose focus method via ref.
    // Guard: only pass a valid ref to useImperativeHandle. When the component
    // is rendered without a ref (e.g. the nested preview editor), React dev
    // mode may pass a frozen empty object which causes "Cannot add property
    // current, object is not extensible".
    const safeRef =
      typeof ref === 'function' || (ref && 'current' in ref) ? ref : null;
    useImperativeHandle(safeRef, () => ({
      focus: () => {
        editorInstanceRef.current?.focus();
      },
    }));

    // Copy button state
    const [copied, setCopied] = useState(false);
    const diffContext = useContext(WorkspaceDiffContext);
    const diffPaths = useMemo(
      () => diffContext?.diffPaths ?? new Set<string>(),
      [diffContext?.diffPaths]
    );
    const preferredRepoId = useUiPreferencesStore(
      (state) => state.fileSearchRepoId
    );
    const setFileSearchRepo = useUiPreferencesStore(
      (state) => state.setFileSearchRepo
    );
    const slashCommandsQuery = useSlashCommands(executor, {
      workspaceId: sessionId ? workspaceId : undefined,
      sessionId,
      repoId,
    });
    const listRecentRepos = useCallback(async () => repoApi.listRecent(), []);
    const getRepoById = useCallback(async (targetRepoId: string) => {
      try {
        return await repoApi.getById(targetRepoId);
      } catch {
        return null;
      }
    }, []);
    const chooseRepo = useCallback(async (repos: RepoLike[]) => {
      const repoResult = (await SelectionDialog.show({
        initialPageId: 'selectRepo',
        pages: buildRepoSelectionPages(repos.map(toRepoItem)) as Record<
          string,
          SelectionPage
        >,
      })) as RepoSelectionResult | undefined;
      return repoResult;
    }, []);
    const handleCreateTag = useCallback(async () => {
      try {
        const result = await TagEditDialog.show({
          tag: null,
        });
        return result === 'saved';
      } catch {
        return false;
      }
    }, []);
    const searchFileTags = useCallback(
      async (
        query: string,
        options: { repoIds?: string[] }
      ): Promise<SearchResultItemLike[]> => {
        const results = await searchTagsAndFiles(query, options);
        const mappedResults: SearchResultItemLike[] = [];
        for (const result of results) {
          if (result.type === 'tag' && result.tag) {
            mappedResults.push({ type: 'tag', tag: result.tag });
          }
          if (result.type === 'file' && result.file) {
            mappedResults.push({ type: 'file', file: result.file });
          }
        }
        return mappedResults;
      },
      []
    );
    const handleCopy = useCallback(async () => {
      if (!value) return;
      try {
        // Unescape markdown-escaped underscores for cleaner clipboard output
        const unescaped = value.replace(/\\_/g, '_');
        await writeClipboardViaBridge(unescaped);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 400);
      } catch {
        // noop – bridge handles fallback
      }
    }, [value]);
    const imageNodeDefinition = useMemo(
      () =>
        createImageNode({
          fetchAttachmentUrl: fetchAttachmentSasUrl,
          openImagePreview: (options) => {
            ImagePreviewDialog.show(options);
          },
        }),
      []
    );
    const attachmentNodeDefinition = useMemo(
      () =>
        createAttachmentNode({
          fetchAttachmentUrl: fetchAttachmentSasUrl,
        }),
      []
    );
    const { ImageNode, IMAGE_TRANSFORMER, $isImageNode } = imageNodeDefinition;
    const { AttachmentNode, ATTACHMENT_TRANSFORMER } = attachmentNodeDefinition;

    const initialConfig = useMemo(
      () => ({
        namespace: 'md-wysiwyg',
        onError: console.error,
        theme: {
          paragraph: 'mb-1 last:mb-0',
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
            ul: 'my-1 list-disc pl-6',
            ol: 'my-1 list-decimal pl-6',
            listitem: '',
            nested: {
              // Hide the structural wrapper marker Lexical adds for nested items.
              listitem: 'list-none pl-4',
            },
          },
          link: 'text-blue-600 dark:text-blue-400 underline underline-offset-2 cursor-pointer hover:text-blue-800 dark:hover:text-blue-300',
          text: {
            bold: 'font-semibold',
            italic: 'italic',
            underline: 'underline underline-offset-2',
            strikethrough: 'line-through',
            code: 'font-mono bg-muted bg-panel px-1 py-0.5 rounded',
          },
          code: 'block font-mono bg-secondary rounded-md px-3 py-2 my-2 whitespace-pre overflow-x-auto',
          codeHighlight: CODE_HIGHLIGHT_CLASSES,
          table: 'border-collapse my-2 w-full text-sm',
          tableRow: '',
          tableCell: 'border border-low px-3 py-2 text-left align-top',
          tableCellHeader:
            'bg-muted font-semibold border border-low px-3 py-2 text-left align-top',
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
          AttachmentNode,
          PrCommentNode,
          ComponentInfoNode,
          TableNode,
          TableRowNode,
          TableCellNode,
        ],
      }),
      [AttachmentNode, ImageNode]
    );

    // Full markdown transformers for both edit and display modes.
    // Custom element transformers come first for matching precedence.
    const allTransformers: Transformer[] = useMemo(
      () => [
        TABLE_TRANSFORMER,
        IMAGE_TRANSFORMER,
        ATTACHMENT_TRANSFORMER,
        PR_COMMENT_EXPORT_TRANSFORMER,
        PR_COMMENT_TRANSFORMER,
        COMPONENT_INFO_EXPORT_TRANSFORMER,
        COMPONENT_INFO_TRANSFORMER,
        ...TRANSFORMERS,
      ],
      [ATTACHMENT_TRANSFORMER, IMAGE_TRANSFORMER]
    );

    // Memoized handlers for ContentEditable to prevent re-renders
    const handlePaste = useCallback(
      (event: React.ClipboardEvent) => {
        if (!onPasteFiles || disabled) return;

        const dt = event.clipboardData;
        if (!dt) return;

        const filesFromItems = Array.from(dt.items || [])
          .filter((item) => item.kind === 'file')
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);

        const clipboardFiles =
          filesFromItems.length > 0
            ? filesFromItems
            : Array.from(dt.files || []);

        const files: File[] = dedupeClipboardFiles(clipboardFiles);

        if (files.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          onPasteFiles(files);
        }
      },
      [onPasteFiles, disabled]
    );

    // Memoized placeholder element
    const placeholderElement = useMemo(
      () => (
        <div
          className={cn(
            'absolute top-0 left-0 text-base text-secondary-foreground text-low pointer-events-none truncate',
            className
          )}
        >
          {placeholder}
        </div>
      ),
      [placeholder, className]
    );

    const editorContent = (
      <div className="wysiwyg text-base relative">
        <EditorWorkspaceContext.Provider value={workspaceId}>
          <SessionContext.Provider value={sessionId}>
            <LocalAttachmentsContext.Provider value={localAttachments ?? []}>
              <LexicalComposer initialConfig={initialConfig}>
                <EditorRefPlugin editorRef={editorInstanceRef} />
                <MarkdownSyncPlugin
                  value={value}
                  onChange={onChange}
                  onEditorStateChange={onEditorStateChange}
                  editable={!disabled}
                  transformers={allTransformers}
                />
                {!disabled && !showStaticToolbar && <ToolbarPlugin />}

                <div className="relative">
                  <RichTextPlugin
                    contentEditable={
                      <ContentEditable
                        className={cn('outline-none', className)}
                        aria-label={
                          disabled ? 'Markdown content' : 'Markdown editor'
                        }
                        onPasteCapture={handlePaste}
                      />
                    }
                    placeholder={placeholderElement}
                    ErrorBoundary={LexicalErrorBoundary}
                  />
                </div>

                {showStaticToolbar && (
                  <StaticToolbarPlugin
                    saveStatus={saveStatus}
                    extraActions={staticToolbarActions}
                    readOnly={disabled}
                    onRequestEdit={onRequestEdit}
                  />
                )}

                <MarkdownShortcutPlugin transformers={allTransformers} />
                <ListPlugin />
                <TablePlugin />
                <CodeHighlightPlugin />
                {/* Only include editing plugins when not in read-only mode */}
                {!disabled && (
                  <>
                    {autoFocus && <AutoFocusPlugin />}
                    <HistoryPlugin />
                    <CodeBlockEscapePlugin />
                    <InlineCodeBoundaryPlugin />
                    <PasteMarkdownPlugin transformers={allTransformers} />
                    <TypeaheadOpenProvider>
                      <FileTagTypeaheadPlugin
                        repoIds={repoIds}
                        diffPaths={diffPaths}
                        preferredRepoId={preferredRepoId}
                        setPreferredRepoId={setFileSearchRepo}
                        listRecentRepos={listRecentRepos}
                        getRepoById={getRepoById}
                        chooseRepo={chooseRepo}
                        onCreateTag={handleCreateTag}
                        searchTagsAndFiles={searchFileTags}
                      />
                      {executor && (
                        <SlashCommandTypeaheadPlugin
                          enabled={true}
                          commands={slashCommandsQuery.commands}
                          isInitialized={slashCommandsQuery.isInitialized}
                          isDiscovering={slashCommandsQuery.discovering}
                        />
                      )}
                      <KeyboardCommandsPlugin
                        onCmdEnter={onCmdEnter}
                        onShiftCmdEnter={onShiftCmdEnter}
                        onChange={onChange}
                        transformers={allTransformers}
                        sendShortcut={sendShortcut}
                      />
                    </TypeaheadOpenProvider>
                    <ImageKeyboardPlugin isTargetNode={$isImageNode} />
                    <ComponentInfoKeyboardPlugin
                      isTargetNode={$isComponentInfoNode}
                    />
                  </>
                )}
                {/* Link sanitization for read-only mode */}
                {disabled && <ReadOnlyLinkPlugin />}
                {/* Clickable code for file paths in read-only mode */}
                {disabled && findMatchingDiffPath && onCodeClick && (
                  <ClickableCodePlugin
                    findMatchingDiffPath={findMatchingDiffPath}
                    onCodeClick={onCodeClick}
                  />
                )}
              </LexicalComposer>
            </LocalAttachmentsContext.Provider>
          </SessionContext.Provider>
        </EditorWorkspaceContext.Provider>
      </div>
    );

    // Wrap with action buttons in read-only mode
    if (disabled && !hideActions) {
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
);

export default memo(WYSIWYGEditor);
