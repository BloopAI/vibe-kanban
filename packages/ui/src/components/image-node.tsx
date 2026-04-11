import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { NodeKey, SerializedLexicalNode, Spread, $getNodeByKey } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { Download, File, HelpCircle, Loader2, X } from 'lucide-react';
import {
  useWorkspaceId,
  useSessionId,
  useLocalAttachments,
  type LocalAttachmentMetadata,
} from './WorkspaceContext';
import {
  createDecoratorNode,
  type DecoratorNodeConfig,
} from './create-decorator-node';

const ATTACHMENT_URL_STALE_TIME = 4 * 60 * 1000;
const IMAGE_FILE_EXTENSION_REGEX =
  /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i;

type AttachmentType = 'file' | 'thumbnail';

interface AttachmentUrlResult {
  url: string | null;
  loading: boolean;
}

interface ImageMetadataLike {
  exists: boolean;
  file_name?: string | null;
  size_bytes?: bigint | null;
  format?: string | null;
  proxy_url?: string | null;
}

export interface OpenImagePreviewOptions {
  imageUrl: string;
  altText: string;
  fileName?: string;
  format?: string;
  sizeBytes?: bigint | null;
}

export interface CreateImageNodeOptions {
  fetchAttachmentUrl: (
    attachmentId: string,
    type: AttachmentType
  ) => Promise<string>;
  openImagePreview: (options: OpenImagePreviewOptions) => void;
}

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

function isImageLikeFileName(name: string): boolean {
  const normalized = name.trim();
  if (!normalized) {
    return false;
  }

  return IMAGE_FILE_EXTENSION_REGEX.test(normalized);
}

function truncatePath(path: string, maxLength = 24): string {
  const filename = path.split('/').pop() || path;
  if (filename.length <= maxLength) return filename;
  return filename.slice(0, maxLength - 3) + '...';
}

function formatFileSize(bytes: bigint | number | null | undefined): string {
  if (!bytes) return '';
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadBlobUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error('Failed to download attachment');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function toMetadataFromLocalImage(
  localImage: LocalAttachmentMetadata | undefined
): ImageMetadataLike | null {
  if (!localImage) return null;

  return {
    exists: true,
    file_name: localImage.file_name,
    size_bytes: BigInt(localImage.size_bytes),
    format: localImage.format,
    proxy_url: localImage.proxy_url,
  };
}

function useImageMetadata(
  workspaceId: string | undefined,
  sessionId: string | undefined,
  src: string,
  localAttachments: LocalAttachmentMetadata[]
) {
  const isVibeImage = src.startsWith('.vibe-attachments/');

  const localImage = useMemo(
    () => localAttachments.find((attachment) => attachment.path === src),
    [localAttachments, src]
  );

  const localImageMetadata = useMemo(
    () => toMetadataFromLocalImage(localImage),
    [localImage]
  );

  const shouldFetch = isVibeImage && !!workspaceId && !localImage;

  const query = useQuery({
    queryKey: ['image-metadata', workspaceId, sessionId, src],
    queryFn: async (): Promise<ImageMetadataLike | null> => {
      if (!workspaceId || !sessionId) return null;

      const response = await fetch(
        `/api/workspaces/${workspaceId}/attachments/metadata?path=${encodeURIComponent(src)}&session_id=${sessionId}`
      );
      const payload = await response.json();
      return payload.data as ImageMetadataLike | null;
    },
    enabled: shouldFetch && !!sessionId,
    staleTime: Infinity,
  });

  return {
    data: localImageMetadata ?? query.data,
    isLoading: localImage ? false : query.isLoading,
  };
}

function useAttachmentUrl(
  attachmentId: string | null,
  type: AttachmentType,
  fetchAttachmentUrl: CreateImageNodeOptions['fetchAttachmentUrl']
): AttachmentUrlResult {
  const query = useQuery({
    queryKey: ['attachment-url', attachmentId, type],
    queryFn: () => fetchAttachmentUrl(attachmentId as string, type),
    enabled: !!attachmentId,
    staleTime: ATTACHMENT_URL_STALE_TIME,
  });

  return {
    url: query.data ?? null,
    loading: query.isLoading,
  };
}

export function createImageNode(options: CreateImageNodeOptions) {
  function ImageComponent({
    data,
    nodeKey,
    onDoubleClickEdit,
  }: {
    data: ImageData;
    nodeKey: NodeKey;
    onDoubleClickEdit: (event: React.MouseEvent) => void;
  }): JSX.Element {
    const { t } = useTranslation('common');
    const { src, altText } = data;
    const workspaceId = useWorkspaceId();
    const sessionId = useSessionId();
    const localAttachments = useLocalAttachments();
    const [editor] = useLexicalComposerContext();

    const isVibeImage = src.startsWith('.vibe-attachments/');
    const isPendingAttachment = src.startsWith('pending-attachment://');
    const isAttachment = isPendingAttachment || src.startsWith('attachment://');
    const attachmentId =
      !isPendingAttachment && isAttachment
        ? src.replace('attachment://', '')
        : null;
    const localAttachment = useMemo(
      () => localAttachments.find((attachment) => attachment.path === src),
      [localAttachments, src]
    );
    const isImageAttachment =
      isAttachment &&
      (localAttachment?.mime_type?.startsWith('image/') ||
        isImageLikeFileName(altText));

    const { url: thumbnailUrl, loading: attachmentLoading } = useAttachmentUrl(
      isImageAttachment && !localAttachment ? attachmentId : null,
      'thumbnail',
      options.fetchAttachmentUrl
    );
    const { url: fullSizeUrl } = useAttachmentUrl(
      localAttachment ? null : attachmentId,
      'file',
      options.fetchAttachmentUrl
    );

    const { data: metadata, isLoading: loading } = useImageMetadata(
      workspaceId,
      sessionId,
      src,
      localAttachments
    );
    const workspaceDisplayName =
      metadata?.file_name || localAttachment?.file_name || altText || src;
    const isWorkspaceImage =
      isVibeImage &&
      ((localAttachment?.mime_type?.startsWith('image/') ?? false) ||
        isImageLikeFileName(workspaceDisplayName));
    const showDownloadButton = Boolean(
      (isAttachment &&
        (localAttachment?.proxy_url || fullSizeUrl || metadata?.proxy_url)) ||
        (!isWorkspaceImage && metadata?.proxy_url)
    );

    const handleClick = useCallback(
      (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const localAttachmentUrl = localAttachment?.proxy_url ?? null;

        if (isAttachment && (localAttachmentUrl || fullSizeUrl)) {
          const resolvedFullSizeUrl = localAttachmentUrl || fullSizeUrl;
          if (!resolvedFullSizeUrl) return;

          if (isImageAttachment && (localAttachmentUrl || thumbnailUrl)) {
            options.openImagePreview({
              imageUrl: resolvedFullSizeUrl,
              altText,
              fileName: altText || undefined,
            });
          } else {
            window.open(resolvedFullSizeUrl, '_blank', 'noopener,noreferrer');
          }
          return;
        }

        if (metadata?.exists && metadata.proxy_url) {
          if (isWorkspaceImage) {
            options.openImagePreview({
              imageUrl: metadata.proxy_url,
              altText,
              fileName: metadata.file_name ?? undefined,
              format: metadata.format ?? undefined,
              sizeBytes: metadata.size_bytes,
            });
          } else {
            window.open(metadata.proxy_url, '_blank', 'noopener,noreferrer');
          }
        }
      },
      [
        isAttachment,
        localAttachment?.proxy_url,
        fullSizeUrl,
        isImageAttachment,
        thumbnailUrl,
        metadata,
        isWorkspaceImage,
        altText,
      ]
    );

    const handleDownload = useCallback(
      (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const downloadUrl =
          localAttachment?.proxy_url ??
          fullSizeUrl ??
          (!isWorkspaceImage ? (metadata?.proxy_url ?? null) : null);
        if (!downloadUrl) return;

        downloadBlobUrl(downloadUrl, altText || 'attachment').catch((error) => {
          console.error('Failed to download attachment:', error);
        });
      },
      [
        localAttachment?.proxy_url,
        fullSizeUrl,
        isWorkspaceImage,
        metadata,
        altText,
      ]
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

    let thumbnailContent: React.ReactNode;
    let displayName: string;
    let metadataLine: string | null = null;

    const hasContext = !!workspaceId;
    const hasLocalImage = localAttachments.some(
      (attachment) => attachment.path === src
    );

    if (isAttachment) {
      const previewUrl = localAttachment?.proxy_url ?? thumbnailUrl;

      if (isImageAttachment && !localAttachment && attachmentLoading) {
        thumbnailContent = (
          <div className="w-10 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        );
      } else if (isImageAttachment && previewUrl) {
        thumbnailContent = (
          <img
            src={previewUrl}
            alt={altText}
            className="w-10 h-10 object-cover rounded flex-shrink-0"
            draggable={false}
          />
        );
      } else {
        thumbnailContent = (
          <div className="w-10 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
            <File className="w-5 h-5 text-muted-foreground" />
          </div>
        );
      }
      displayName = truncatePath(
        altText || t('kanban.imageAttachmentNameFallback')
      );
      if (localAttachment?.is_pending) {
        const parts = ['Uploading'];
        const sizeText = formatFileSize(localAttachment.size_bytes);
        if (sizeText) {
          parts.push(sizeText);
        }
        metadataLine = parts.join(' · ');
      }
      if (!isImageAttachment) {
        const format = altText.split('.').pop()?.trim();
        metadataLine = format ? format.toUpperCase() : null;
      }
    } else if (isVibeImage && (hasLocalImage || hasContext)) {
      if (!isWorkspaceImage) {
        thumbnailContent = (
          <div className="w-10 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
            <File className="w-5 h-5 text-muted-foreground" />
          </div>
        );
        displayName = truncatePath(workspaceDisplayName);
        const parts: string[] = [];
        if (metadata?.format) {
          parts.push(metadata.format.toUpperCase());
        }
        const sizeText = formatFileSize(metadata?.size_bytes);
        if (sizeText) {
          parts.push(sizeText);
        }
        metadataLine = parts.length > 0 ? parts.join(' · ') : null;
      } else if (loading) {
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
        displayName = truncatePath(workspaceDisplayName);

        const parts: string[] = [];
        if (metadata.format) {
          parts.push(metadata.format.toUpperCase());
        }
        const sizeText = formatFileSize(metadata.size_bytes);
        if (sizeText) {
          parts.push(sizeText);
        }
        if (parts.length > 0) {
          metadataLine = parts.join(' · ');
        }
      } else {
        thumbnailContent = (
          <div className="w-10 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
            <HelpCircle className="w-5 h-5 text-muted-foreground" />
          </div>
        );
        displayName = truncatePath(src);
      }
    } else if (!isVibeImage) {
      thumbnailContent = (
        <div className="w-10 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
          <HelpCircle className="w-5 h-5 text-muted-foreground" />
        </div>
      );
      displayName = truncatePath(altText || src);
    } else {
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
            aria-label={t('kanban.removeImage')}
            type="button"
          >
            <X className="w-2.5 h-2.5 text-background" />
          </button>
        )}
        {showDownloadButton ? (
          <button
            onClick={handleDownload}
            className={
              editor.isEditable()
                ? 'absolute top-1 right-6 w-4 h-4 rounded-full bg-foreground/70 hover:bg-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity'
                : 'absolute top-1 right-1 w-4 h-4 rounded-full bg-foreground/70 hover:bg-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity'
            }
            aria-label={t('kanban.downloadAttachment')}
            type="button"
          >
            <Download className="w-2.5 h-2.5 text-background" />
          </button>
        ) : null}
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
        conversion: (element: HTMLElement) => {
          const imageElement = element as HTMLImageElement;
          return {
            node: createNode({
              src: imageElement.getAttribute('src') || '',
              altText: imageElement.getAttribute('alt') || '',
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

  return {
    ImageNode: result.Node,
    $createImageNode: (src: string, altText: string) =>
      result.createNode({ src, altText }),
    $isImageNode: result.isNode,
    IMAGE_TRANSFORMER: result.transformers[0],
  };
}
