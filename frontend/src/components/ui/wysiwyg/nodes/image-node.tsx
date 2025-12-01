import { useCallback } from 'react';
import {
  $createTextNode,
  $getNodeByKey,
  DecoratorNode,
  DOMConversionMap,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HelpCircle, Loader2 } from 'lucide-react';
import {
  useTaskAttemptId,
  useTaskId,
  useLocalImages,
} from '../context/task-attempt-context';
import { useImageMetadata } from '@/hooks/useImageMetadata';
import { ImagePreviewDialog } from '@/components/dialogs/wysiwyg/ImagePreviewDialog';
import { formatFileSize } from '@/lib/utils';

export type SerializedImageNode = Spread<
  {
    src: string;
    altText: string;
  },
  SerializedLexicalNode
>;

function truncatePath(path: string, maxLength = 24): string {
  const filename = path.split('/').pop() || path;
  if (filename.length <= maxLength) return filename;
  return filename.slice(0, maxLength - 3) + '...';
}

function ImageComponent({
  src,
  altText,
  nodeKey,
}: {
  src: string;
  altText: string;
  nodeKey: NodeKey;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const taskAttemptId = useTaskAttemptId();
  const taskId = useTaskId();
  const localImages = useLocalImages();

  const isVibeImage = src.startsWith('.vibe-images/');

  // Use TanStack Query for caching metadata across component recreations
  // Pass both taskAttemptId and taskId - the hook prefers taskAttemptId when available
  // Also pass localImages for immediate rendering of newly uploaded images
  const { data: metadata, isLoading: loading } = useImageMetadata(
    taskAttemptId,
    src,
    taskId,
    localImages
  );

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Open preview dialog if we have a valid image URL
      if (metadata?.exists && metadata.proxy_url) {
        ImagePreviewDialog.show({
          imageUrl: metadata.proxy_url,
          altText,
          fileName: metadata.file_name ?? undefined,
          format: metadata.format ?? undefined,
          sizeBytes: metadata.size_bytes,
        });
      }
    },
    [metadata, altText]
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Don't allow editing in read-only mode
      if (!editor.isEditable()) return;

      event.preventDefault();
      event.stopPropagation();

      // Convert back to markdown text for editing
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isImageNode(node)) {
          const markdownText = `![${node.getAltText()}](${node.getSrc()})`;
          const textNode = $createTextNode(markdownText);
          node.replace(textNode);
          textNode.select(markdownText.length, markdownText.length);
        }
      });
    },
    [editor, nodeKey]
  );

  // Determine what to show as thumbnail
  let thumbnailContent: React.ReactNode;
  let displayName: string;
  let metadataLine: string | null = null;

  // Check if we have context for fetching metadata (either taskAttemptId or taskId)
  const hasContext = !!taskAttemptId || !!taskId;
  // Check if image exists in local images (for create mode where no task context exists yet)
  const hasLocalImage = localImages.some((img) => img.path === src);

  if (isVibeImage && (hasLocalImage || hasContext)) {
    if (loading) {
      thumbnailContent = (
        <div className="w-10 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        </div>
      );
      displayName = truncatePath(src);
    } else if (metadata?.exists && metadata.proxy_url) {
      thumbnailContent = (
        <img
          src={metadata.proxy_url}
          alt={altText}
          className="w-10 h-10 object-cover rounded flex-shrink-0"
          draggable={false}
        />
      );
      displayName = truncatePath(metadata.file_name || altText || src);
      // Build metadata line
      const parts: string[] = [];
      if (metadata.format) {
        parts.push(metadata.format.toUpperCase());
      }
      const sizeStr = formatFileSize(metadata.size_bytes);
      if (sizeStr) {
        parts.push(sizeStr);
      }
      if (parts.length > 0) {
        metadataLine = parts.join(' · ');
      }
    } else {
      // Vibe image but not found or error
      thumbnailContent = (
        <div className="w-10 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
          <HelpCircle className="w-5 h-5 text-muted-foreground" />
        </div>
      );
      displayName = truncatePath(src);
    }
  } else if (!isVibeImage) {
    // Non-vibe-image: show question mark and path
    thumbnailContent = (
      <div className="w-10 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
        <HelpCircle className="w-5 h-5 text-muted-foreground" />
      </div>
    );
    displayName = truncatePath(altText || src);
  } else {
    // isVibeImage but no context available - fallback to question mark
    thumbnailContent = (
      <div className="w-10 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
        <HelpCircle className="w-5 h-5 text-muted-foreground" />
      </div>
    );
    displayName = truncatePath(src);
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-1.5 py-1 bg-muted rounded border align-middle cursor-pointer border-border hover:border-muted-foreground"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      role="button"
      tabIndex={0}
    >
      {thumbnailContent}
      <span className="flex flex-col min-w-0">
        <span className="text-xs text-muted-foreground truncate max-w-[120px]">
          {displayName}
        </span>
        {metadataLine && (
          <span className="text-[10px] text-muted-foreground/70 truncate max-w-[120px]">
            {metadataLine}
          </span>
        )}
      </span>
    </span>
  );
}

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__key);
  }

  constructor(src: string, altText: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    return span;
  }

  updateDOM(): false {
    return false;
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    const { src, altText } = serializedNode;
    return $createImageNode(src, altText);
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
    };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: (domNode: HTMLElement) => {
          const img = domNode as HTMLImageElement;
          const src = img.getAttribute('src') || '';
          const altText = img.getAttribute('alt') || '';
          return { node: $createImageNode(src, altText) };
        },
        priority: 0,
      }),
    };
  }

  exportDOM(): DOMExportOutput {
    const img = document.createElement('img');
    img.setAttribute('src', this.__src);
    img.setAttribute('alt', this.__altText);
    return { element: img };
  }

  getSrc(): string {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  decorate(): JSX.Element {
    return (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        nodeKey={this.__key}
      />
    );
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }
}

export function $createImageNode(src: string, altText: string): ImageNode {
  return new ImageNode(src, altText);
}

export function $isImageNode(
  node: LexicalNode | null | undefined
): node is ImageNode {
  return node instanceof ImageNode;
}
