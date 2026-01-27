import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  FileText,
  Settings2,
  Send,
  Trash2,
  Loader2,
  Paperclip,
  File,
  X,
  Bot,
  Square,
  FolderOpen,
  GripVertical,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { pmChatApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { cn } from '@/lib/utils';
import { Loader } from '@/components/ui/loader';
import { useAutoReviewSettings } from '@/hooks/useAutoReviewSettings';
import { AutoReviewSettingsDialog } from '@/components/dialogs/tasks/AutoReviewSettingsDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PmConversation, PmAttachment, PmChatAgent } from 'shared/types';
import { usePmChat } from '@/contexts/PmChatContext';

interface PmDocsPanelProps {
  projectId?: string;
  className?: string;
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentPreview({
  attachment,
  projectId,
  onDelete,
}: {
  attachment: PmAttachment;
  projectId: string;
  onDelete?: () => void;
}) {
  const isImage = isImageMimeType(attachment.mime_type);
  const fileUrl = pmChatApi.getAttachmentUrl(projectId, attachment.id);

  return (
    <div className="group relative inline-block">
      {isImage ? (
        <a href={fileUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={fileUrl}
            alt={attachment.file_name}
            className="max-w-full max-h-40 rounded border hover:opacity-90 transition-opacity"
          />
        </a>
      ) : (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 rounded border bg-muted/50 hover:bg-muted transition-colors"
        >
          <File size={16} className="text-muted-foreground" />
          <div className="flex flex-col min-w-0">
            <span className="text-sm truncate max-w-[150px]">
              {attachment.file_name}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatFileSize(Number(attachment.file_size))}
            </span>
          </div>
        </a>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute -top-2 -right-2 h-5 w-5 p-0 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
        >
          <X size={12} />
        </Button>
      )}
    </div>
  );
}

function ChatMessage({
  message,
  attachments,
  projectId,
  onDelete,
  onDeleteAttachment,
}: {
  message: PmConversation;
  attachments: PmAttachment[];
  projectId: string;
  onDelete?: () => void;
  onDeleteAttachment?: (attachmentId: string) => void;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const messageAttachments = attachments.filter(
    (a) => a.conversation_id === message.id
  );

  // Check if this is an attachment-only message
  const isAttachmentMessage = message.content.startsWith('[Attachment:');

  return (
    <div
      className={cn(
        'group flex flex-col gap-1 p-2 rounded-lg text-sm',
        isUser
          ? 'bg-primary/10 ml-4'
          : isSystem
            ? 'bg-muted/50 border border-dashed'
            : 'bg-muted/30 mr-4'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground capitalize">
          {message.role}
        </span>
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onDelete}
          >
            <Trash2 size={12} />
          </Button>
        )}
      </div>
      {/* Show message content unless it's just an attachment placeholder */}
      {!isAttachmentMessage && (
        isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <WYSIWYGEditor value={message.content} disabled className="text-sm" />
          </div>
        )
      )}
      {/* Show attachments */}
      {messageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {messageAttachments.map((attachment) => (
            <AttachmentPreview
              key={attachment.id}
              attachment={attachment}
              projectId={projectId}
              onDelete={
                onDeleteAttachment
                  ? () => onDeleteAttachment(attachment.id)
                  : undefined
              }
            />
          ))}
        </div>
      )}
      <span className="text-[10px] text-muted-foreground">
        {new Date(message.created_at).toLocaleTimeString()}
      </span>
    </div>
  );
}

// Workspace doc type for display
interface WorkspaceDoc {
  path: string;
  repo_name: string;
  content: string;
}

export function PmDocsPanel({ projectId, className }: PmDocsPanelProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'docs'>('chat');
  const [messageInput, setMessageInput] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('sonnet');
  const [selectedAgent, setSelectedAgent] = useState<PmChatAgent | undefined>(undefined);
  const [isComposing, setIsComposing] = useState(false); // IME composition state
  const [panelWidth, setPanelWidth] = useState(320); // Default width 320px
  const [isResizing, setIsResizing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<WorkspaceDoc | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use context for streaming state (persists across route changes)
  const {
    streamState,
    startStream,
    appendToStream,
    endStream,
    setAbortController,
    abortStream,
  } = usePmChat();

  // Derive stream state for current project
  const isAiResponding = streamState.isAiResponding && streamState.projectId === projectId;
  const streamingResponse = streamState.projectId === projectId ? streamState.streamingResponse : '';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { settings: autoReviewSettings, updateSettings } =
    useAutoReviewSettings(projectId);

  // Available AI models per agent (memoized to avoid dependency issues)
  // Updated 2025-01: Latest models for each CLI
  const modelsByAgent = useMemo(
    () =>
      ({
        CLAUDE_CLI: [
          { value: 'sonnet', label: 'Sonnet (4.5)' },
          { value: 'opus', label: 'Opus (4.5)' },
          { value: 'haiku', label: 'Haiku (3.5)' },
        ],
        CODEX_CLI: [
          { value: 'codex-1', label: 'Codex-1 (o3 optimized)' },
          { value: 'codex-mini-latest', label: 'Codex Mini' },
          { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
          { value: 'o3', label: 'o3' },
          { value: 'o4-mini', label: 'o4-mini' },
          { value: 'gpt-4.1', label: 'GPT-4.1' },
        ],
        GEMINI_CLI: [
          { value: 'gemini-3-flash', label: 'Gemini 3 Flash' },
          { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
          { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        ],
        OPENCODE_CLI: [{ value: 'default', label: 'Default' }],
      }) as Record<string, { value: string; label: string }[]>,
    []
  );

  // Get models for currently selected agent
  const aiModels = selectedAgent ? modelsByAgent[selectedAgent] ?? [] : [];

  const {
    data: chatData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['pm-chat', projectId],
    queryFn: () => (projectId ? pmChatApi.getChat(projectId) : null),
    enabled: !!projectId,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['pm-chat-attachments', projectId],
    queryFn: () => (projectId ? pmChatApi.getAttachments(projectId) : []),
    enabled: !!projectId,
  });

  // Query for workspace docs (files in docs/ folder)
  const { data: workspaceDocs, isLoading: isLoadingDocs } = useQuery({
    queryKey: ['pm-chat-workspace-docs', projectId],
    queryFn: () => (projectId ? pmChatApi.getWorkspaceDocs(projectId) : null),
    enabled: !!projectId && activeTab === 'docs',
  });

  // Query for available AI agents (CLIs)
  const { data: availableAgentsData } = useQuery({
    queryKey: ['pm-chat-available-agents'],
    queryFn: () => pmChatApi.getAvailableAgents(),
  });

  // Get list of available agents for the selector
  const availableAgents = useMemo(
    () => availableAgentsData?.agents?.filter((a) => a.available) ?? [],
    [availableAgentsData?.agents]
  );
  // Set default agent if none selected and we have available agents
  useEffect(() => {
    if (!selectedAgent && availableAgents.length > 0) {
      setSelectedAgent(availableAgents[0].agent);
    }
  }, [selectedAgent, availableAgents]);

  // Reset model when agent changes
  useEffect(() => {
    if (selectedAgent && modelsByAgent[selectedAgent]) {
      const models = modelsByAgent[selectedAgent];
      if (models.length > 0 && !models.find((m) => m.value === selectedModel)) {
        setSelectedModel(models[0].value);
      }
    }
  }, [selectedAgent, selectedModel, modelsByAgent]);

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) =>
      pmChatApi.deleteMessage(projectId!, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
    },
  });

  const clearChatMutation = useMutation({
    mutationFn: () => pmChatApi.clearChat(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
      queryClient.invalidateQueries({
        queryKey: ['pm-chat-attachments', projectId],
      });
      setShowClearDialog(false);
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: (file: File) => pmChatApi.uploadAttachment(projectId!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
      queryClient.invalidateQueries({
        queryKey: ['pm-chat-attachments', projectId],
      });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      pmChatApi.deleteAttachment(projectId!, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pm-chat-attachments', projectId],
      });
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatData?.messages, attachments]);

  // Note: Stream cleanup is now handled by PmChatContext which persists across route changes

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate new width from right edge
      const newWidth = window.innerWidth - e.clientX;
      // Constrain between min and max
      const constrainedWidth = Math.max(280, Math.min(600, newWidth));
      setPanelWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const handleOpenSettings = () => {
    if (!projectId) return;
    AutoReviewSettingsDialog.show({
      projectId,
      currentSettings: autoReviewSettings,
      onSave: updateSettings,
    });
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !projectId || isAiResponding) return;

    const content = messageInput.trim();
    setMessageInput('');
    startStream(projectId);

    // First, send the user message and show it immediately
    try {
      await pmChatApi.sendMessage(projectId, { content, role: 'user' });
      // Refresh to show the user message right away
      await queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
    } catch (error) {
      console.error('Failed to send user message:', error);
      endStream();
      return;
    }

    // Then start the AI response stream
    const controller = pmChatApi.aiChat(
      projectId,
      content,
      selectedModel,
      // onContent - limit to 100KB to prevent memory issues
      (newContent: string) => {
        appendToStream(newContent);
      },
      // onDone
      () => {
        endStream();
        queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
      },
      // onError
      (error: string) => {
        endStream();
        console.error('AI chat error:', error);
        // Invalidate to show the assistant error or partial response
        queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
      },
      // onTaskCreated - refresh task list when AI creates a task
      () => {
        queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
        queryClient.invalidateQueries({ queryKey: ['task-summary', projectId] });
      },
      // onDocsUpdated - refresh docs when AI updates them
      () => {
        queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
        queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      },
      // onToolUse - can show additional indicator if needed
      (toolInfo: string) => {
        console.log('AI using tool:', toolInfo);
      },
      // agent - pass the selected AI agent (CLI)
      selectedAgent
    );
    setAbortController(controller);
  };

  const handleStopAi = () => {
    abortStream();
    queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent sending during IME composition (Japanese/Chinese input)
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || !projectId) return;

      const fileArray = Array.from(files);
      setUploadingFiles((prev) => [...prev, ...fileArray.map((f) => f.name)]);

      for (const file of fileArray) {
        try {
          await uploadAttachmentMutation.mutateAsync(file);
        } catch (error) {
          console.error('Failed to upload file:', file.name, error);
        } finally {
          setUploadingFiles((prev) =>
            prev.filter((name) => name !== file.name)
          );
        }
      }
    },
    [projectId, uploadAttachmentMutation]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (
      dropZoneRef.current &&
      !dropZoneRef.current.contains(e.relatedTarget as Node)
    ) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFolderClick = () => {
    folderInputRef.current?.click();
  };

  return (
    <div
      className={cn(
        'h-full flex flex-col bg-muted/30 border-r relative',
        !isExpanded && 'w-10',
        isResizing && 'select-none',
        className
      )}
      style={isExpanded ? { width: `${panelWidth}px` } : undefined}
    >
      {/* Resize handle */}
      {isExpanded && (
        <div
          ref={resizeRef}
          onMouseDown={handleResizeStart}
          className={cn(
            'absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/20 z-10',
            isResizing && 'bg-primary/30'
          )}
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 opacity-0 hover:opacity-100 bg-muted rounded p-0.5">
            <GripVertical size={12} className="text-muted-foreground" />
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/50">
        {isExpanded && (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MessageSquare size={16} />
            <span>{t('tasks:pmDocs.title', 'PM Chat')}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          {isExpanded && projectId && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      disabled={!chatData?.messages?.length}
                      onClick={() => setShowClearDialog(true)}
                    >
                      <Trash2 size={14} className="text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t('tasks:pmDocs.clearChat', 'Clear chat history')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {t('tasks:pmDocs.clearChatTitle', 'Clear chat history?')}
                    </DialogTitle>
                    <DialogDescription>
                      {t(
                        'tasks:pmDocs.clearChatDescription',
                        'This will permanently delete all chat messages. This action cannot be undone.'
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowClearDialog(false)}
                    >
                      {t('common:actions.cancel')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => clearChatMutation.mutate()}
                    >
                      {t('common:actions.delete')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleOpenSettings}
                      className="h-6 w-6 p-0"
                    >
                      <Settings2
                        size={14}
                        className={cn(
                          autoReviewSettings.enabled
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        )}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t(
                      'tasks:autoReviewSettings.title',
                      'Auto-Review Settings'
                    )}
                    {autoReviewSettings.enabled && (
                      <span className="ml-1 text-primary">(ON)</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpanded}
            className={cn('h-6 w-6 p-0', !isExpanded && 'mx-auto')}
          >
            {isExpanded ? (
              <ChevronLeft size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {!projectId ? (
            <div className="flex-1 flex items-center justify-center p-3">
              <div className="text-sm text-muted-foreground italic">
                {t('tasks:pmDocs.noProject', 'No project selected')}
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader size={24} />
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center p-3">
              <div className="text-sm text-destructive">
                {t('common:states.error')}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Tab buttons */}
              <div className="flex mx-2 mt-2 border rounded-md bg-muted/50 p-0.5">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs transition-colors',
                    activeTab === 'chat'
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <MessageSquare size={12} />
                  {t('tasks:pmDocs.chat', 'Chat')}
                </button>
                <button
                  onClick={() => setActiveTab('docs')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs transition-colors',
                    activeTab === 'docs'
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <FileText size={12} />
                  {t('tasks:pmDocs.docs', 'Docs')}
                </button>
              </div>

              {activeTab === 'chat' ? (
                <div
                  ref={dropZoneRef}
                  className={cn(
                    'flex-1 flex flex-col overflow-hidden relative',
                    isDragging && 'ring-2 ring-primary ring-inset'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {/* Drag overlay */}
                  {isDragging && (
                    <div className="absolute inset-0 bg-primary/10 flex items-center justify-center z-10 pointer-events-none">
                      <div className="flex flex-col items-center gap-2 text-primary">
                        <Paperclip size={32} />
                        <span className="text-sm font-medium">
                          {t('tasks:pmDocs.dropFiles', 'Drop files here')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {chatData?.messages?.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic text-center py-4">
                        {t(
                          'tasks:pmDocs.noMessages',
                          'Start a conversation with the PM'
                        )}
                      </div>
                    ) : (
                      <>
                        {chatData?.messages?.map((message) => (
                          <ChatMessage
                            key={message.id}
                            message={message}
                            attachments={attachments}
                            projectId={projectId}
                            onDelete={() =>
                              deleteMessageMutation.mutate(message.id)
                            }
                            onDeleteAttachment={(attachmentId) =>
                              deleteAttachmentMutation.mutate(attachmentId)
                            }
                          />
                        ))}
                        {/* Streaming AI response */}
                        {isAiResponding && streamingResponse && (
                          <div className="flex flex-col gap-1 p-2 rounded-lg text-sm bg-muted/30 mr-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <Bot size={12} />
                                {t('tasks:pmDocs.assistant', 'Assistant')}
                              </span>
                              <Loader2
                                size={12}
                                className="animate-spin text-muted-foreground"
                              />
                            </div>
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <WYSIWYGEditor value={streamingResponse} disabled className="text-sm" />
                            </div>
                          </div>
                        )}
                        {isAiResponding && !streamingResponse && (
                          <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                            <Loader2 size={14} className="animate-spin" />
                            <span>
                              {t(
                                'tasks:pmDocs.aiThinking',
                                'AI is thinking...'
                              )}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Uploading indicator */}
                  {uploadingFiles.length > 0 && (
                    <div className="px-2 py-1 border-t bg-muted/30">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 size={12} className="animate-spin" />
                        <span>
                          {t('tasks:pmDocs.uploading', 'Uploading')}{' '}
                          {uploadingFiles.join(', ')}...
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Input */}
                  <div className="p-2 border-t bg-background/50">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files)}
                    />
                    <input
                      ref={folderInputRef}
                      type="file"
                      {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                      multiple
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files)}
                    />
                    <div className="flex gap-2">
                      <div className="flex-1 flex flex-col gap-1">
                        <Textarea
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onCompositionStart={handleCompositionStart}
                          onCompositionEnd={handleCompositionEnd}
                          placeholder={t(
                            'tasks:pmDocs.messagePlaceholder',
                            'Type a message...'
                          )}
                          className="min-h-[60px] max-h-[120px] resize-none text-sm"
                          disabled={isAiResponding}
                        />
                        <div className="flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleAttachClick}
                                  className="h-6 w-6 p-0"
                                  disabled={
                                    uploadingFiles.length > 0 || isAiResponding
                                  }
                                >
                                  <Paperclip
                                    size={14}
                                    className="text-muted-foreground"
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {t('tasks:pmDocs.attachFile', 'Attach files')}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleFolderClick}
                                  className="h-6 w-6 p-0"
                                  disabled={
                                    uploadingFiles.length > 0 || isAiResponding
                                  }
                                >
                                  <FolderOpen
                                    size={14}
                                    className="text-muted-foreground"
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {t('tasks:pmDocs.attachFolder', 'Attach folder')}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {/* Agent selector */}
                          {availableAgents.length > 1 && (
                            <Select
                              value={selectedAgent}
                              onValueChange={(v) => setSelectedAgent(v as PmChatAgent)}
                              disabled={isAiResponding}
                            >
                              <SelectTrigger className="h-6 w-auto text-[10px] border-0 bg-transparent px-1">
                                <SelectValue placeholder="CLI" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableAgents.map((agent) => (
                                  <SelectItem
                                    key={agent.agent}
                                    value={agent.agent}
                                    className="text-xs"
                                  >
                                    {agent.display_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {/* Model selector */}
                          <Select
                            value={selectedModel}
                            onValueChange={setSelectedModel}
                            disabled={isAiResponding}
                          >
                            <SelectTrigger className="h-6 w-auto text-[10px] border-0 bg-transparent px-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {aiModels.map((model) => (
                                <SelectItem
                                  key={model.value}
                                  value={model.value}
                                  className="text-xs"
                                >
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {isAiResponding ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleStopAi}
                          className="h-auto"
                        >
                          <Square size={16} />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handleSendMessage}
                          disabled={!messageInput.trim()}
                          className="h-auto"
                        >
                          <Send size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {selectedDoc ? (
                    // Show selected document content
                    <div className="flex flex-col h-full">
                      <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
                        <button
                          onClick={() => setSelectedDoc(null)}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          ← {t('common:actions.back', 'Back')}
                        </button>
                        <span className="text-xs font-medium truncate flex-1">
                          {selectedDoc.path}
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2">
                        <WYSIWYGEditor
                          value={selectedDoc.content}
                          disabled
                          className="text-sm"
                        />
                      </div>
                    </div>
                  ) : isLoadingDocs ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                  ) : workspaceDocs?.docs && workspaceDocs.docs.length > 0 ? (
                    // Show list of documents
                    <div className="p-2 space-y-1">
                      {workspaceDocs.docs.map((doc, index) => (
                        <button
                          key={`${doc.repo_name}-${doc.path}-${index}`}
                          onClick={() => setSelectedDoc(doc)}
                          className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors group"
                        >
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate group-hover:text-primary">
                                {doc.path}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {doc.repo_name}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic p-4 text-center">
                      {t(
                        'tasks:pmDocs.noWorkspaceDocs',
                        'No documentation files found in docs/ folder'
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Collapsed state indicator */}
      {!isExpanded && (
        <div className="flex-1 flex items-center justify-center">
          <MessageSquare size={16} className="text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
