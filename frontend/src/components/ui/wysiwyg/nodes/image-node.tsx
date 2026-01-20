import { useCallback } from 'react';
import { NodeKey, SerializedLexicalNode, Spread, $getNodeByKey } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HelpCircle, Loader2, X } from 'lucide-react';
import {
  useTaskAttemptId,
  useTaskId,
  useLocalImages,
} from '../context/task-attempt-context';
import { useImageMetadata } from '@/hooks/useImageMetadata';
import { ImagePreviewDialog } from '@/components/dialogs/wysiwyg/ImagePreviewDialog';
import { formatFileSize } from '@/lib/utils';
import {
  createDecoratorNode,
  type DecoratorNodeConfig,
  type GeneratedDecoratorNode,
} from '../lib/create-decorator-node';

export interface ImageData {
  src: string;
  altText: string;
}

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
  data,
  nodeKey,
  onDoubleClickEdit,
}: {
  data: ImageData;
  nodeKey: NodeKey;
  onDoubleClickEdit: (event: React.MouseEvent) => void;
}): JSX.Element {
  const { src, altText } = data;
  const taskAttemptId = useTaskAttemptId();
  const taskId = useTaskId();
  const localImages = useLocalImages();
  const [editor] = useLexicalComposerContext();

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

  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!editor.isEditable()) return;

      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node) {
          node.remove();
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
      className="group relative inline-flex items-center gap-1.5 pl-1.5 pr-5 py-1 ml-0.5 mr-0.5 bg-muted rounded border cursor-pointer border-border hover:border-muted-foreground transition-colors align-bottom"
      onClick={handleClick}
      onDoubleClick={onDoubleClickEdit}
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
      {editor.isEditable() && (
        <button
          onClick={handleDelete}
          className="absolute top-1 right-1 w-4 h-4 rounded-full bg-foreground/70 hover:bg-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Remove image"
          type="button"
        >
          <X className="w-2.5 h-2.5 text-background" />
        </button>
      )}
    </span>
  );
}

const config: DecoratorNodeConfig<ImageData> = {
  type: 'image',
  serialization: {
    format: 'inline',
    pattern: /!\[([^\]]*)\]\(([^)]+)\)/,
    trigger: ')',
    serialize: (data) => `![${data.altText}](${data.src})`,
    deserialize: (match) => ({ src: match[2], altText: match[1] }),
  },
  component: ImageComponent,
  domStyle: {
    display: 'inline-block',
    paddingLeft: '2px',
    paddingRight: '2px',
    verticalAlign: 'bottom',
  },
  keyboardSelectable: false,
  importDOM: (createNode) => ({
    img: () => ({
      conversion: (el: HTMLElement) => {
        const img = el as HTMLImageElement;
        return {
          node: createNode({
            src: img.getAttribute('src') || '',
            altText: img.getAttribute('alt') || '',
          }),
        };
      },
      priority: 0,
    }),
  }),
  exportDOM: (data) => {
    const img = document.createElement('img');
    img.setAttribute('src', data.src);
    img.setAttribute('alt', data.altText);
    return img;
  },
};

const result = createDecoratorNode(config);

export const ImageNode = result.Node;
export type ImageNodeInstance = GeneratedDecoratorNode<ImageData>;
export const $createImageNode = (src: string, altText: string) =>
  result.createNode({ src, altText });
export const $isImageNode = result.isNode;
export const IMAGE_TRANSFORMER = result.transformers[0];
