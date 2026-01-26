import { useState, useRef, useEffect, useCallback } from 'react';
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
  RefreshCw,
  Bot,
  Square,
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
import type { PmConversation, PmAttachment } from 'shared/types';

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
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
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

export function PmDocsPanel({ projectId, className }: PmDocsPanelProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'docs'>('chat');
  const [messageInput, setMessageInput] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('sonnet');
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState('');
  const abortControllerRef = useRef<{ abort: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { settings: autoReviewSettings, updateSettings } =
    useAutoReviewSettings(projectId);

  // Available AI models (Claude CLI models)
  const aiModels = [
    { value: 'sonnet', label: 'Sonnet' },
    { value: 'opus', label: 'Opus' },
    { value: 'haiku', label: 'Haiku' },
  ];

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

  // Sync task summary to PM docs
  const syncTaskSummaryMutation = useMutation({
    mutationFn: () => pmChatApi.syncTaskSummary(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatData?.messages, attachments]);

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
    setIsAiResponding(true);
    setStreamingResponse('');

    // First, send the user message and show it immediately
    try {
      await pmChatApi.sendMessage(projectId, { content, role: 'user' });
      // Refresh to show the user message right away
      await queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
    } catch (error) {
      console.error('Failed to send user message:', error);
      setIsAiResponding(false);
      return;
    }

    // Then start the AI response stream
    abortControllerRef.current = pmChatApi.aiChat(
      projectId,
      content,
      selectedModel,
      // onContent
      (newContent: string) => {
        setStreamingResponse((prev) => prev + newContent);
      },
      // onDone
      () => {
        setIsAiResponding(false);
        setStreamingResponse('');
        queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
      },
      // onError
      (error: string) => {
        setIsAiResponding(false);
        setStreamingResponse('');
        console.error('AI chat error:', error);
        // Invalidate to show the assistant error or partial response
        queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
      }
    );
  };

  const handleStopAi = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAiResponding(false);
    setStreamingResponse('');
    queryClient.invalidateQueries({ queryKey: ['pm-chat', projectId] });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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

  return (
    <div
      className={cn(
        'h-full flex flex-col bg-muted/30 border-r transition-all duration-200',
        isExpanded ? 'w-80' : 'w-10',
        className
      )}
    >
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => syncTaskSummaryMutation.mutate()}
                      className="h-6 w-6 p-0"
                      disabled={syncTaskSummaryMutation.isPending}
                    >
                      <RefreshCw
                        size={14}
                        className={cn(
                          'text-muted-foreground',
                          syncTaskSummaryMutation.isPending && 'animate-spin'
                        )}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t(
                      'tasks:pmDocs.syncTasks',
                      'Sync tasks & dependencies to docs'
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
                            <div className="whitespace-pre-wrap break-words">
                              {streamingResponse}
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
                    <div className="flex gap-2">
                      <div className="flex-1 flex flex-col gap-1">
                        <Textarea
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyDown={handleKeyDown}
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
                                {t('tasks:pmDocs.attachFile', 'Attach file')}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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
                <div className="flex-1 overflow-y-auto p-3">
                  {chatData?.pm_docs ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <WYSIWYGEditor value={chatData.pm_docs} disabled />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">
                      {t(
                        'tasks:pmDocs.noDocs',
                        'No documentation generated yet. Chat with the PM to create specs.'
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
