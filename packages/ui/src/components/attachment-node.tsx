import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { NodeKey, SerializedLexicalNode, Spread, $getNodeByKey } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { Download, File, HelpCircle, X } from 'lucide-react';
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

type AttachmentType = 'file' | 'thumbnail';

interface AttachmentUrlResult {
  url: string | null;
}

interface AttachmentMetadataLike {
  exists: boolean;
  file_name?: string | null;
  size_bytes?: bigint | null;
  format?: string | null;
  proxy_url?: string | null;
}

export interface CreateAttachmentNodeOptions {
  fetchAttachmentUrl: (
    attachmentId: string,
    type: AttachmentType
  ) => Promise<string>;
}

export interface AttachmentData {
  src: string;
  label: string;
}

export type SerializedAttachmentNode = Spread<
  {
    src: string;
    label: string;
  },
  SerializedLexicalNode
>;

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

function inferFormat(
  label: string,
  explicitFormat?: string | null
): string | null {
  if (explicitFormat) {
    return explicitFormat.toUpperCase();
  }

  const extension = label.split('.').pop()?.trim();
  if (!extension || extension === label) {
    return null;
  }

  return extension.toUpperCase();
}

function toMetadataFromLocalAttachment(
  localAttachment: LocalAttachmentMetadata | undefined
): AttachmentMetadataLike | null {
  if (!localAttachment) return null;

  return {
    exists: true,
    file_name: localAttachment.file_name,
    size_bytes: BigInt(localAttachment.size_bytes),
    format: localAttachment.format,
    proxy_url: localAttachment.proxy_url,
  };
}

function useAttachmentMetadata(
  workspaceId: string | undefined,
  sessionId: string | undefined,
  src: string,
  localAttachments: LocalAttachmentMetadata[]
) {
  const isWorkspaceAttachment = src.startsWith('.vibe-attachments/');

  const localAttachment = useMemo(
    () => localAttachments.find((attachment) => attachment.path === src),
    [localAttachments, src]
  );

  const localAttachmentMetadata = useMemo(
    () => toMetadataFromLocalAttachment(localAttachment),
    [localAttachment]
  );

  const shouldFetch =
    isWorkspaceAttachment && !!workspaceId && !localAttachment;

  const query = useQuery({
    queryKey: ['attachment-metadata', workspaceId, sessionId, src],
    queryFn: async (): Promise<AttachmentMetadataLike | null> => {
      if (!workspaceId || !sessionId) return null;

      const response = await fetch(
        `/api/workspaces/${workspaceId}/attachments/metadata?path=${encodeURIComponent(src)}&session_id=${sessionId}`
      );
      const payload = await response.json();
      return payload.data as AttachmentMetadataLike | null;
    },
    enabled: shouldFetch && !!sessionId,
    staleTime: Infinity,
  });

  return {
    data: localAttachmentMetadata ?? query.data,
  };
}

function useAttachmentFileUrl(
  attachmentId: string | null,
  fetchAttachmentUrl: CreateAttachmentNodeOptions['fetchAttachmentUrl']
): AttachmentUrlResult {
  const query = useQuery({
    queryKey: ['attachment-url', attachmentId, 'file'],
    queryFn: () => fetchAttachmentUrl(attachmentId as string, 'file'),
    enabled: !!attachmentId,
    staleTime: ATTACHMENT_URL_STALE_TIME,
  });

  return {
    url: query.data ?? null,
  };
}

export function createAttachmentNode(options: CreateAttachmentNodeOptions) {
  function AttachmentComponent({
    data,
    nodeKey,
    onDoubleClickEdit,
  }: {
    data: AttachmentData;
    nodeKey: NodeKey;
    onDoubleClickEdit: (event: React.MouseEvent) => void;
  }): JSX.Element {
    const { t } = useTranslation('common');
    const { src, label } = data;
    const workspaceId = useWorkspaceId();
    const sessionId = useSessionId();
    const localAttachments = useLocalAttachments();
    const [editor] = useLexicalComposerContext();

    const isWorkspaceAttachment = src.startsWith('.vibe-attachments/');
    const isPendingAttachment = src.startsWith('pending-attachment://');
    const isAttachment = isPendingAttachment || src.startsWith('attachment://');
    const attachmentId =
      !isPendingAttachment && isAttachment
        ? src.replace('attachment://', '')
        : null;

    const { url: attachmentUrl } = useAttachmentFileUrl(
      isAttachment && !isPendingAttachment ? attachmentId : null,
      options.fetchAttachmentUrl
    );

    const { data: metadata } = useAttachmentMetadata(
      workspaceId,
      sessionId,
      src,
      localAttachments
    );

    const resolvedUrl =
      metadata?.proxy_url ?? (isAttachment ? attachmentUrl : null);
    const displayName = truncatePath(
      metadata?.file_name || label || src || t('kanban.previewFile')
    );
    const format = inferFormat(
      label || metadata?.file_name || src,
      metadata?.format
    );
    const sizeText = formatFileSize(metadata?.size_bytes);
    const localAttachment = localAttachments.find(
      (attachment) => attachment.path === src
    );
    const metadataLine = localAttachment?.is_pending
      ? ['Uploading', sizeText].filter(Boolean).join(' · ')
      : metadata?.exists
        ? format && sizeText
          ? `${format} · ${sizeText}`
          : format || sizeText || null
        : null;

    const openUrl = useCallback(
      async (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        let nextUrl = resolvedUrl;
        if (!nextUrl && attachmentId) {
          nextUrl = await options.fetchAttachmentUrl(attachmentId, 'file');
        }

        if (!nextUrl) return;
        window.open(nextUrl, '_blank', 'noopener,noreferrer');
      },
      [attachmentId, resolvedUrl]
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

    const handleDownload = useCallback(
      (event: React.MouseEvent) => {
        openUrl(event).catch((error) => {
          console.error('Failed to open attachment:', error);
        });
      },
      [openUrl]
    );

    const icon =
      isWorkspaceAttachment || isAttachment ? (
        <File className="w-5 h-5 text-muted-foreground" />
      ) : (
        <HelpCircle className="w-5 h-5 text-muted-foreground" />
      );

    return (
      <span
        className="group relative inline-flex items-center gap-1.5 pl-1.5 pr-5 py-1 ml-0.5 mr-0.5 bg-muted rounded border cursor-pointer border-border hover:border-muted-foreground transition-colors align-bottom"
        onClick={(event) => {
          openUrl(event).catch((error) => {
            console.error('Failed to open attachment:', error);
          });
        }}
        onDoubleClick={onDoubleClickEdit}
        role="button"
        tabIndex={0}
      >
        <span className="w-10 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
          {icon}
        </span>
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
        {resolvedUrl && (
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
        )}
      </span>
    );
  }

  const config: DecoratorNodeConfig<AttachmentData> = {
    type: 'attachment',
    serialization: {
      format: 'inline',
      pattern:
        /(?<!!)\[([^\]]+)\]\((attachment:\/\/[^)]+|pending-attachment:\/\/[^)]+|\.vibe-attachments\/[^)]+)\)/,
      trigger: ')',
      serialize: (data) => `[${data.label}](${data.src})`,
      deserialize: (match) => ({ src: match[2], label: match[1] }),
    },
    component: AttachmentComponent,
    domStyle: {
      display: 'inline-block',
      paddingLeft: '2px',
      paddingRight: '2px',
      verticalAlign: 'bottom',
    },
    keyboardSelectable: false,
    exportDOM: (data) => {
      const link = document.createElement('a');
      link.setAttribute('href', data.src);
      link.textContent = data.label;
      return link;
    },
  };

  const result = createDecoratorNode(config);

  return {
    AttachmentNode: result.Node,
    $createAttachmentNode: (src: string, label: string) =>
      result.createNode({ src, label }),
    $isAttachmentNode: result.isNode,
    ATTACHMENT_TRANSFORMER: result.transformers[0],
  };
}
