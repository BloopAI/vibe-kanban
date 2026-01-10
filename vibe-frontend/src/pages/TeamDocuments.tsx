import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  Plus,
  Folder,
  FileText,
  FolderPlus,
  ChevronRight,
  Search,
  Pin,
  Trash2,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Wand2,
  LayoutGrid,
  List,
  GripVertical,
  Loader2,
  Pencil,
  Eye,
  Upload,
  Download,
} from 'lucide-react';
import { DocumentOutline } from '@/components/documents/DocumentOutline';
import { PdfViewer } from '@/components/documents/PdfViewer';
import { MarkdownViewer } from '@/components/documents/MarkdownViewer';
import { DocxViewer } from '@/components/documents/DocxViewer';
import { CsvViewer } from '@/components/documents/CsvViewer';
import { ImageViewer } from '@/components/documents/ImageViewer';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useDocuments } from '@/hooks/useDocuments';
import { useTeams } from '@/hooks/useTeams';
import { documentsApi } from '@/lib/api';

import type { Document, DocumentFolder, DocumentContentResponse, UploadResult } from 'shared/types';

// File type icons
const FILE_TYPE_ICONS: Record<string, string> = {
  markdown: 'md',
  pdf: 'pdf',
  txt: 'txt',
  csv: 'csv',
  xlsx: 'xlsx',
};

export function TeamDocuments() {
  const { t } = useTranslation(['common']);
  const { teamId } = useParams<{ teamId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const docIdFromUrl = searchParams.get('doc');

  const { resolveTeam, isLoading: teamsLoading } = useTeams();
  const team = teamId ? resolveTeam(teamId) : null;
  const actualTeamId = team?.id || '';

  const {
    documents,
    folders,
    isLoading,
    error,
    currentFolderId,
    setCurrentFolderId,
    createDocument,
    updateDocument,
    deleteDocument,
    createFolder,
    deleteFolder,
    refresh,
  } = useDocuments(actualTeamId);

  // Dialog states
  const [isCreateDocOpen, setIsCreateDocOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [docContent, setDocContent] = useState<DocumentContentResponse | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOutline, setShowOutline] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{ added: number; scanned: number; foldersCreated?: number } | null>(null);
  const [isMarkdownEditMode, setIsMarkdownEditMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  // Clear editingDoc when URL doesn't have doc param (e.g., sidebar navigation)
  useEffect(() => {
    if (!docIdFromUrl && editingDoc) {
      setEditingDoc(null);
      setDocContent(null);
    }
  }, [docIdFromUrl]);

  // Handle URL query param for direct document linking
  useEffect(() => {
    if (docIdFromUrl && teamId && !editingDoc && !isLoading) {
      // Detect if param is UUID or slug (UUID has format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(docIdFromUrl);

      // Fetch document by ID or slug
      const fetchPromise = isUUID
        ? documentsApi.get(teamId, docIdFromUrl)
        : documentsApi.getBySlug(teamId, docIdFromUrl);

      fetchPromise
        .then(async (doc) => {
          // Navigate to the document's folder if needed
          if (doc.folder_id && doc.folder_id !== currentFolderId) {
            setCurrentFolderId(doc.folder_id);
          }
          // Open the document
          setEditingDoc(doc);
          setDocContent(null);
          setIsLoadingContent(true);
          setIsMarkdownEditMode(false);

          try {
            const content = await documentsApi.getContent(teamId, doc.id);
            setDocContent(content);
            if (content.content_type === 'text' || content.content_type === 'pdf_text') {
              setEditingDoc(prev => prev ? { ...prev, content: content.content } : null);
            }
          } catch (err) {
            console.error('Failed to load document content:', err);
            setDocContent({
              document_id: doc.id,
              content_type: 'text',
              content: doc.content || '',
              csv_data: null,
              file_path: doc.file_path,
              file_type: doc.file_type,
              mime_type: doc.mime_type,
            });
          } finally {
            setIsLoadingContent(false);
          }
        })
        .catch((err) => {
          console.error('Document not found:', err);
          // Remove invalid doc param from URL
          searchParams.delete('doc');
          setSearchParams(searchParams, { replace: true });
        });
    }
  }, [docIdFromUrl, teamId, isLoading]);

  // Build breadcrumb path
  const breadcrumbs = useMemo(() => {
    const path: DocumentFolder[] = [];
    if (!currentFolderId) return path;

    let folderId: string | null = currentFolderId;
    while (folderId) {
      const folder = folders.find((f) => f.id === folderId);
      if (folder) {
        path.unshift(folder);
        folderId = folder.parent_id;
      } else {
        break;
      }
    }
    return path;
  }, [folders, currentFolderId]);

  // Filter folders and documents for current view
  const currentFolders = useMemo(() => {
    return folders.filter((f) => f.parent_id === currentFolderId);
  }, [folders, currentFolderId]);

  const currentDocuments = useMemo(() => {
    if (searchQuery) {
      return documents.filter((d) =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return documents.filter((d) => d.folder_id === currentFolderId);
  }, [documents, currentFolderId, searchQuery]);

  // Handlers
  const handleCreateDocument = useCallback(async () => {
    if (!newDocTitle.trim()) return;

    try {
      await createDocument({
        title: newDocTitle,
        content: newDocContent || null,
        folder_id: currentFolderId,
        file_type: 'markdown',
        icon: null,
        file_path: null,
        file_size: null,
        mime_type: null,
        storage_provider: null,
        storage_key: null,
      });
      setIsCreateDocOpen(false);
      setNewDocTitle('');
      setNewDocContent('');
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  }, [newDocTitle, newDocContent, currentFolderId, createDocument]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;

    try {
      await createFolder({
        name: newFolderName,
        parent_id: currentFolderId,
        icon: null,
        color: null,
        local_path: null,
      });
      setIsCreateFolderOpen(false);
      setNewFolderName('');
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }, [newFolderName, currentFolderId, createFolder]);

  const handleDeleteDocument = useCallback(
    async (docId: string, filePath?: string | null) => {
      try {
        // If file was stored in Supabase, delete from storage first
        if (filePath && filePath.includes('supabase')) {
          try {
            // Extract the path from the Supabase URL
            // URL format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
            const url = new URL(filePath);
            const pathParts = url.pathname.split('/object/public/');
            if (pathParts.length === 2) {
              const [bucketAndPath] = pathParts[1].split('/', 1);
              const storagePath = pathParts[1].substring(bucketAndPath.length + 1);
              const { supabase } = await import('@/lib/supabase');
              await supabase.storage
                .from('ikanban-bucket')
                .remove([decodeURIComponent(storagePath)]);
            }
          } catch (storageErr) {
            console.warn('Failed to delete from Supabase storage:', storageErr);
            // Continue with database deletion even if storage deletion fails
          }
        }
        // Delete from database
        await deleteDocument(docId);
      } catch (err) {
        console.error('Failed to delete document:', err);
      }
    },
    [deleteDocument]
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      try {
        await deleteFolder(folderId);
      } catch (err) {
        console.error('Failed to delete folder:', err);
      }
    },
    [deleteFolder]
  );

  const handleNavigateToFolder = useCallback(
    (folderId: string | null) => {
      setCurrentFolderId(folderId);
      setSearchQuery('');
      setScanResult(null);
    },
    [setCurrentFolderId]
  );

  // Handle document download
  const handleDownloadDocument = useCallback(async (doc: Document) => {
    try {
      // If file has a storage URL (Supabase), download from there
      if (doc.file_path) {
        // Check if it's a full URL (Supabase) or local path
        if (doc.file_path.startsWith('http')) {
          // Direct download from Supabase URL
          window.open(doc.file_path, '_blank');
        } else {
          // Download from backend file endpoint
          const fileUrl = documentsApi.getFileUrl(teamId!, doc.id);
          window.open(fileUrl, '_blank');
        }
      } else if (doc.content) {
        // For text content stored in database, create a downloadable blob
        const blob = new Blob([doc.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${doc.title}.${doc.file_type || 'txt'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Fallback: try to get content from API
        const content = await documentsApi.getContent(teamId!, doc.id);
        if (content.content) {
          const blob = new Blob([content.content], { type: content.mime_type || 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${doc.title}.${doc.file_type || 'txt'}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      console.error('Failed to download document:', err);
    }
  }, [teamId]);

  // Handle file upload from browser file picker
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !teamId) return;

    setIsUploading(true);
    setUploadResult(null);
    setScanResult(null);

    try {
      const formData = new FormData();

      // Add folder_id if we're in a folder
      if (currentFolderId) {
        formData.append('folder_id', currentFolderId);
      }

      // Add all files
      for (const file of files) {
        formData.append('files[]', file);
      }

      const result = await documentsApi.upload(teamId, formData);
      setUploadResult(result);

      // Refresh document list after successful upload
      if (result.uploaded > 0) {
        refresh();
      }
    } catch (err) {
      console.error('Failed to upload files:', err);
      setUploadResult({
        uploaded: 0,
        skipped: 0,
        errors: ['Upload failed. Please try again.'],
        uploaded_titles: [],
      });
    } finally {
      setIsUploading(false);
      // Clear the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [teamId, currentFolderId, refresh]);

  const handleOpenDocument = useCallback(async (doc: Document) => {
    setEditingDoc(doc);
    setDocContent(null);
    setIsLoadingContent(true);
    setIsMarkdownEditMode(false); // Reset to view mode when opening a new document

    // Update URL with document slug (or ID fallback) for direct linking
    setSearchParams({ doc: doc.slug || doc.id }, { replace: true });

    try {
      // Fetch content using the new API that handles different file types
      const content = await documentsApi.getContent(teamId!, doc.id);
      setDocContent(content);
      // For text/pdf content, also update the editingDoc.content for editing
      if (content.content_type === 'text' || content.content_type === 'pdf_text') {
        setEditingDoc(prev => prev ? { ...prev, content: content.content } : null);
      }
    } catch (err) {
      console.error('Failed to load document content:', err);
      // Fallback to existing content if API fails
      setDocContent({
        document_id: doc.id,
        content_type: 'text',
        content: doc.content || '',
        csv_data: null,
        file_path: doc.file_path,
        file_type: doc.file_type,
        mime_type: doc.mime_type,
      });
    } finally {
      setIsLoadingContent(false);
    }
  }, [teamId, setSearchParams]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, docId: string) => {
    e.dataTransfer.setData('text/plain', docId);
    setDraggedDocId(docId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedDocId(null);
    setDragOverFolderId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverFolderId(folderId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverFolderId(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetFolderId: string) => {
      e.preventDefault();
      const docId = e.dataTransfer.getData('text/plain');
      if (!docId) return;

      const doc = documents.find((d) => d.id === docId);
      if (!doc) return;

      try {
        await updateDocument(doc.id, {
          folder_id: targetFolderId,
          title: doc.title,
          content: doc.content,
          icon: doc.icon,
          is_pinned: doc.is_pinned,
          is_archived: doc.is_archived,
          position: doc.position,
        });
      } catch (err) {
        console.error('Failed to move document:', err);
      }

      setDraggedDocId(null);
      setDragOverFolderId(null);
    },
    [documents, updateDocument]
  );

  const handleSaveDocument = useCallback(async () => {
    if (!editingDoc) return;

    try {
      const updated = await updateDocument(editingDoc.id, {
        folder_id: editingDoc.folder_id,
        title: editingDoc.title,
        content: editingDoc.content,
        icon: editingDoc.icon,
        is_pinned: editingDoc.is_pinned,
        is_archived: editingDoc.is_archived,
        position: editingDoc.position,
      });
      // Update local state with saved document but stay on same page
      if (updated) {
        setEditingDoc(updated);
      }
    } catch (err) {
      console.error('Failed to save document:', err);
    }
  }, [editingDoc, updateDocument]);

  // Format document content as proper markdown
  const handleFormatDocument = useCallback(() => {
    if (!editingDoc?.content) return;

    let content = editingDoc.content;

    // Normalize line endings
    content = content.replace(/\r\n/g, '\n');

    // Split into lines for processing
    const lines = content.split('\n');
    const formattedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      const nextLine = lines[i + 1]?.trim() || '';
      const prevLine = formattedLines[formattedLines.length - 1]?.trim() || '';

      // Skip if already a markdown heading
      if (line.match(/^#{1,6}\s/)) {
        formattedLines.push(line);
        continue;
      }

      // Detect potential headings:
      // - Short line (< 80 chars) that's not empty
      // - Ends with ? or is title-like (starts with capital, no ending punctuation except ?)
      // - Followed by blank line or longer paragraph
      // - Previous line is blank or doesn't exist
      const isShortLine = line.length > 0 && line.length < 80;
      const looksLikeHeading =
        line.match(/^[A-Z]/) && // Starts with capital
        !line.match(/[.!,;:]$/) && // Doesn't end with sentence punctuation
        !line.match(/^[-*]\s/); // Not a list item
      const followedByParagraph =
        nextLine === '' || (nextLine.length > line.length && !nextLine.match(/^[-*#]/));
      const afterBlankOrStart = prevLine === '' || formattedLines.length === 0;

      if (isShortLine && looksLikeHeading && followedByParagraph && afterBlankOrStart) {
        // Convert to heading - use ## for most, # for very short/title-like
        const headingLevel = line.length < 30 && i === 0 ? '#' : '##';
        formattedLines.push(`${headingLevel} ${line}`);
      } else {
        formattedLines.push(line);
      }
    }

    content = formattedLines.join('\n');

    // Ensure blank line before headings (except at start)
    content = content.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');

    // Ensure blank line after headings
    content = content.replace(/(#{1,6}\s[^\n]+)\n([^#\n])/g, '$1\n\n$2');

    // Ensure proper list formatting (space after - or *)
    content = content.replace(/^(\s*[-*])([^\s])/gm, '$1 $2');

    // Normalize multiple blank lines to double
    content = content.replace(/\n{3,}/g, '\n\n');

    // Trim trailing whitespace from each line
    content = content
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');

    // Trim start and end
    content = content.trim();

    // Ensure file ends with single newline
    content = content + '\n';

    setEditingDoc({ ...editingDoc, content });
  }, [editingDoc]);

  // Scroll to a specific line in the textarea
  const handleHeadingClick = useCallback((line: number) => {
    if (!textareaRef.current || !editingDoc?.content) return;

    const lines = editingDoc.content.split('\n');
    let charIndex = 0;

    // Calculate character position of the target line
    for (let i = 0; i < line - 1 && i < lines.length; i++) {
      charIndex += lines[i].length + 1; // +1 for newline
    }

    // Focus and scroll to position
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(charIndex, charIndex);

    // Calculate approximate scroll position
    const lineHeight = 20; // approximate line height in pixels
    const scrollTop = (line - 1) * lineHeight;
    textareaRef.current.scrollTop = Math.max(0, scrollTop - 100);
  }, [editingDoc?.content]);

  // Loading state
  if (error) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            {t('states.error')}
          </AlertTitle>
          <AlertDescription>
            {error.message || 'Failed to load documents'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading || teamsLoading) {
    return <Loader message="Loading documents..." size={32} className="py-8" />;
  }

  if (!team) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            Team not found
          </AlertTitle>
          <AlertDescription>
            The team you're looking for doesn't exist.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Document editor/viewer view
  if (editingDoc) {
    const fileType = docContent?.file_type?.toLowerCase() || '';
    const contentType = docContent?.content_type || '';

    // Determine viewer type based on file type
    const isPdf = fileType === 'pdf';
    const isMarkdown = fileType === 'md' || fileType === 'markdown';
    const isDocx = fileType === 'docx';
    const isCsv = contentType === 'csv';
    const isImage = contentType === 'image_base64';
    const isPlainText = !isPdf && !isMarkdown && !isDocx && !isCsv && !isImage &&
      (contentType === 'text' || contentType === 'pdf_text');
    const isBinary = !isPdf && !isDocx && contentType === 'binary';

    // Get file URL for viewers that need it
    const fileUrl = teamId ? documentsApi.getFileUrl(teamId, editingDoc.id) : null;

    // Editable types (plain text, txt files)
    const isEditable = isPlainText && !['json', 'xml', 'html', 'htm'].includes(fileType);

    return (
      <div className="h-full flex flex-col">
        {/* Editor Header */}
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingDoc(null);
                  setDocContent(null);
                  // Clear document ID from URL
                  searchParams.delete('doc');
                  setSearchParams(searchParams, { replace: true });
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Input
                value={editingDoc.title}
                onChange={(e) =>
                  setEditingDoc({ ...editingDoc, title: e.target.value })
                }
                className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 px-0"
                placeholder="Document title"
                disabled={!isEditable && !(isMarkdown && isMarkdownEditMode)}
              />
              {docContent && (
                <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                  {docContent.file_type.toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isEditable && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowOutline(!showOutline)}
                    title={showOutline ? 'Hide outline' : 'Show outline'}
                  >
                    {showOutline ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeftOpen className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFormatDocument}
                    title="Format document"
                  >
                    <Wand2 className="h-4 w-4 mr-1" />
                    Format
                  </Button>
                  <Button size="sm" onClick={handleSaveDocument}>
                    Save
                  </Button>
                </>
              )}
              {isMarkdown && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowOutline(!showOutline)}
                    title={showOutline ? 'Hide outline' : 'Show outline'}
                  >
                    {showOutline ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeftOpen className="h-4 w-4" />
                    )}
                  </Button>
                  {isMarkdownEditMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFormatDocument}
                      title="Format document"
                    >
                      <Wand2 className="h-4 w-4 mr-1" />
                      Format
                    </Button>
                  )}
                  <Button
                    variant={isMarkdownEditMode ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setIsMarkdownEditMode(!isMarkdownEditMode)}
                    title={isMarkdownEditMode ? 'Switch to view mode' : 'Switch to edit mode'}
                  >
                    {isMarkdownEditMode ? (
                      <>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </>
                    ) : (
                      <>
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </>
                    )}
                  </Button>
                  {isMarkdownEditMode && (
                    <Button size="sm" onClick={handleSaveDocument}>
                      Save
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 flex">
          {/* Loading State */}
          {isLoadingContent && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Markdown Viewer / Editor */}
          {!isLoadingContent && isMarkdown && docContent && (
            isMarkdownEditMode ? (
              <>
                {showOutline && (
                  <div className="w-64 shrink-0 border-r bg-muted/30 overflow-auto">
                    <DocumentOutline
                      content={editingDoc.content || ''}
                      onHeadingClick={handleHeadingClick}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0 p-4">
                  <Textarea
                    ref={textareaRef}
                    value={editingDoc.content || ''}
                    onChange={(e) =>
                      setEditingDoc({ ...editingDoc, content: e.target.value })
                    }
                    className="w-full h-full resize-none font-mono text-sm"
                    placeholder="Start writing..."
                  />
                </div>
              </>
            ) : (
              <MarkdownViewer
                content={docContent.content || ''}
                showOutline={showOutline}
                className="flex-1 min-w-0"
              />
            )
          )}

          {/* PDF Viewer */}
          {!isLoadingContent && isPdf && fileUrl && (
            <div className="flex-1 min-w-0">
              <PdfViewer fileUrl={fileUrl} className="h-full" />
            </div>
          )}

          {/* DOCX Viewer */}
          {!isLoadingContent && isDocx && fileUrl && (
            <DocxViewer
              fileUrl={fileUrl}
              showOutline={showOutline}
              className="flex-1 min-w-0"
            />
          )}

          {/* CSV Viewer */}
          {!isLoadingContent && isCsv && docContent?.csv_data && (
            <CsvViewer
              data={docContent.csv_data}
              className="flex-1 min-w-0"
            />
          )}

          {/* Image Viewer */}
          {!isLoadingContent && isImage && docContent && (
            <ImageViewer
              src={docContent.content}
              alt={editingDoc.title}
              className="flex-1 min-w-0"
            />
          )}

          {/* Plain Text Editor (for txt, etc.) */}
          {!isLoadingContent && isEditable && (
            <>
              {showOutline && (
                <div className="w-64 shrink-0 border-r bg-muted/30 overflow-auto">
                  <DocumentOutline
                    content={editingDoc.content || ''}
                    onHeadingClick={handleHeadingClick}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0 p-4">
                <Textarea
                  ref={textareaRef}
                  value={editingDoc.content || ''}
                  onChange={(e) =>
                    setEditingDoc({ ...editingDoc, content: e.target.value })
                  }
                  className="w-full h-full resize-none font-mono text-sm"
                  placeholder="Start writing..."
                />
              </div>
            </>
          )}

          {/* Read-only text viewer (JSON, XML, HTML) */}
          {!isLoadingContent && isPlainText && !isEditable && docContent && (
            <div className="flex-1 min-w-0 p-4 overflow-auto">
              <pre className="font-mono text-sm whitespace-pre-wrap">
                {docContent.content}
              </pre>
            </div>
          )}

          {/* Binary File Info */}
          {!isLoadingContent && isBinary && docContent && (
            <div className="flex-1 min-w-0 p-8 flex flex-col items-center justify-center">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{editingDoc.title}</h3>
              <p className="text-muted-foreground text-center whitespace-pre-line">
                {docContent.content}
              </p>
              {docContent.file_path && (
                <p className="mt-4 text-xs text-muted-foreground font-mono">
                  {docContent.file_path}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const hasContent = currentFolders.length > 0 || currentDocuments.length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{team.icon || '👥'}</span>
            <h1 className="text-lg font-semibold">{team.name}</h1>
            <span className="text-muted-foreground">/ Documents</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Hidden files input */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept=".md,.txt,.pdf,.csv,.json,.xml,.html,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.svg"
              onChange={handleFileUpload}
            />

            <Button
              variant="default"
              size="sm"
              className="gap-2"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateFolderOpen(true)}
            >
              <FolderPlus className="h-4 w-4 mr-1" />
              New Folder
            </Button>
            <Button size="sm" onClick={() => setIsCreateDocOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Document
            </Button>
          </div>
        </div>

        {/* Scan Result */}
        {scanResult && (
          <div className="mt-2 text-sm text-muted-foreground">
            Scanned {scanResult.scanned} items
            {scanResult.foldersCreated !== undefined && `, ${scanResult.foldersCreated} folders`}
            , added {scanResult.added} new documents
          </div>
        )}

        {/* Upload Result */}
        {uploadResult && (
          <div className={`mt-2 text-sm ${uploadResult.errors.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {uploadResult.uploaded > 0 && (
              <span>Uploaded {uploadResult.uploaded} file{uploadResult.uploaded !== 1 ? 's' : ''}</span>
            )}
            {uploadResult.skipped > 0 && (
              <span>{uploadResult.uploaded > 0 ? ', ' : ''}Skipped {uploadResult.skipped} duplicate{uploadResult.skipped !== 1 ? 's' : ''}</span>
            )}
            {uploadResult.errors.length > 0 && (
              <span>{(uploadResult.uploaded > 0 || uploadResult.skipped > 0) ? '. ' : ''}Errors: {uploadResult.errors.join(', ')}</span>
            )}
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
          <button
            onClick={() => handleNavigateToFolder(null)}
            className="hover:text-foreground"
          >
            Documents
          </button>
          {breadcrumbs.map((folder) => (
            <div key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4" />
              <button
                onClick={() => handleNavigateToFolder(folder.id)}
                className="hover:text-foreground"
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        {/* Search and View Toggle */}
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-r-none"
              title="List view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-l-none"
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {!hasContent && !searchQuery ? (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No documents yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first document or folder to get started
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateFolderOpen(true)}
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Create Folder
                </Button>
                <Button onClick={() => setIsCreateDocOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Document
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-2'}>
            {/* Folders */}
            {currentFolders.map((folder) => (
              <div
                key={folder.id}
                className={`${viewMode === 'grid'
                  ? 'flex flex-col items-center p-4 rounded-lg border hover:bg-accent cursor-pointer group text-center'
                  : 'flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer group'
                  } ${dragOverFolderId === folder.id ? 'ring-2 ring-primary bg-primary/10' : ''}`}
                onClick={() => handleNavigateToFolder(folder.id)}
                onDragOver={(e) => handleDragOver(e, folder.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, folder.id)}
              >
                {viewMode === 'grid' ? (
                  <>
                    <Folder className="h-12 w-12 text-blue-500 mb-2" />
                    <span className="font-medium text-sm truncate w-full">{folder.name}</span>
                    <span className="text-xs text-muted-foreground mt-1">
                      {new Date(folder.updated_at).toLocaleDateString()}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Folder className="h-5 w-5 text-blue-500" />
                      <span className="font-medium">{folder.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(folder.updated_at).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.id);
                        }}
                        title="Delete folder"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Documents */}
            {currentDocuments.map((doc) => (
              <div
                key={doc.id}
                draggable
                onDragStart={(e) => handleDragStart(e, doc.id)}
                onDragEnd={handleDragEnd}
                className={`${viewMode === 'grid'
                  ? 'flex flex-col items-center p-4 rounded-lg border hover:bg-accent cursor-pointer group text-center'
                  : 'flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer group'
                  } ${draggedDocId === doc.id ? 'opacity-50' : ''}`}
                onClick={() => handleOpenDocument(doc)}
              >
                {viewMode === 'grid' ? (
                  <>
                    <div className="relative">
                      <FileText className="h-12 w-12 text-gray-500 mb-2" />
                      {doc.is_pinned && (
                        <Pin className="h-3 w-3 text-amber-500 absolute -top-1 -right-1" />
                      )}
                    </div>
                    <span className="font-medium text-sm truncate w-full">{doc.title}</span>
                    <span className="text-xs text-muted-foreground uppercase mt-1">
                      {FILE_TYPE_ICONS[doc.file_type] || doc.file_type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(doc.updated_at).toLocaleDateString()}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
                      <FileText className="h-5 w-5 text-gray-500" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{doc.title}</span>
                          {doc.is_pinned && (
                            <Pin className="h-3 w-3 text-amber-500" />
                          )}
                          <span className="text-xs text-muted-foreground uppercase">
                            {FILE_TYPE_ICONS[doc.file_type] || doc.file_type}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Updated {new Date(doc.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadDocument(doc);
                        }}
                        title="Download document"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(doc.id, doc.file_path);
                        }}
                        title="Delete document"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {searchQuery && currentDocuments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No documents found matching "{searchQuery}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Document Dialog */}
      <Dialog open={isCreateDocOpen} onOpenChange={setIsCreateDocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Document</DialogTitle>
            <DialogDescription>
              Create a new markdown document in this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Document title"
              />
            </div>
            <div>
              <Label htmlFor="doc-content">Content (optional)</Label>
              <Textarea
                id="doc-content"
                value={newDocContent}
                onChange={(e) => setNewDocContent(e.target.value)}
                placeholder="Start writing..."
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDocOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDocument} disabled={!newDocTitle.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize your documents.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateFolderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
