import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, FileText, CheckSquare } from 'lucide-react';
import { useDiffComments } from '@/contexts/DiffCommentsContext';
import { CommentDisplay } from './CommentDisplay';
import { DiffComment } from '@/lib/types';

interface CommentsPanelProps {
  taskId: string;
  attemptId: string;
}

export const CommentsPanel: React.FC<CommentsPanelProps> = ({ taskId, attemptId }) => {
  const { comments, draftComments, loadComments, submitDraftComments, isLoading } = useDiffComments();
  const [selectedDrafts, setSelectedDrafts] = useState<Set<string>>(new Set());
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [promptPreview, setPromptPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadComments(taskId, attemptId);
  }, [taskId, attemptId]);

  const handleSelectAll = () => {
    if (selectedDrafts.size === draftComments.length) {
      setSelectedDrafts(new Set());
    } else {
      setSelectedDrafts(new Set(draftComments.map(c => c.id)));
    }
  };

  const handleToggleDraft = (commentId: string) => {
    const newSelected = new Set(selectedDrafts);
    if (newSelected.has(commentId)) {
      newSelected.delete(commentId);
    } else {
      newSelected.add(commentId);
    }
    setSelectedDrafts(newSelected);
  };

  const handlePreviewSubmit = async () => {
    if (selectedDrafts.size === 0) return;

    const selectedComments = draftComments.filter(c => selectedDrafts.has(c.id));
    const prompt = generatePromptPreview(selectedComments);
    setPromptPreview(prompt);
    setShowPromptPreview(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Submit with auto-execute enabled and the formatted prompt
      const result = await submitDraftComments(Array.from(selectedDrafts), true, promptPreview);
      if (result) {
        setSelectedDrafts(new Set());
        setShowPromptPreview(false);
        
        // Show notification about execution status
        if (result.execution_started) {
          console.log('Follow-up execution started:', result.execution_message);
        } else if (result.execution_message) {
          console.error('Failed to start execution:', result.execution_message);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const generatePromptPreview = (comments: DiffComment[]) => {
    let prompt = 'Please review the following code comments and suggestions:\n\n';
    
    const groupedByFile = comments.reduce((acc, comment) => {
      if (!acc[comment.file_path]) {
        acc[comment.file_path] = [];
      }
      acc[comment.file_path].push(comment);
      return acc;
    }, {} as Record<string, DiffComment[]>);

    Object.entries(groupedByFile).forEach(([filePath, fileComments]) => {
      prompt += `\n### ${filePath}\n\n`;
      fileComments.forEach(comment => {
        prompt += `**Lines ${comment.selection_start_line}-${comment.selection_end_line}:**\n`;
        prompt += `${comment.comment_text}\n\n`;
      });
    });

    prompt += '\nPlease analyze these comments and provide improved code that addresses all the feedback.';
    return prompt;
  };

  const submittedComments = comments.filter(c => c.status === 'submitted');

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <MessageSquare className="h-8 w-8 text-muted-foreground animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Code Comments
            {comments.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {comments.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <Tabs defaultValue="drafts" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
              <TabsTrigger value="drafts" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Drafts
                {draftComments.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {draftComments.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="submitted" className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4" />
                Submitted
                {submittedComments.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {submittedComments.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="drafts" className="flex-1 mt-0 overflow-hidden">
              <div className="h-full flex flex-col">
                {draftComments.length > 0 && (
                  <div className="p-4 border-b flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                    >
                      {selectedDrafts.size === draftComments.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handlePreviewSubmit}
                      disabled={selectedDrafts.size === 0}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Submit {selectedDrafts.size > 0 ? `(${selectedDrafts.size})` : ''}
                    </Button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4">
                    {draftComments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p>No draft comments yet</p>
                        <p className="text-sm mt-1">Select code in the diff view to add comments</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {draftComments.map(comment => (
                          <div key={comment.id} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={selectedDrafts.has(comment.id)}
                              onChange={() => handleToggleDraft(comment.id)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <CommentDisplay comment={comment} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="submitted" className="flex-1 mt-0 overflow-hidden">
              <div className="h-full overflow-y-auto">
                <div className="p-4">
                  {submittedComments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No submitted comments yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {submittedComments.map(comment => (
                        <CommentDisplay key={comment.id} comment={comment} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={showPromptPreview} onOpenChange={setShowPromptPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Review Comments Prompt</DialogTitle>
            <DialogDescription>
              This prompt will be automatically sent to the current LLM executor when you click "Confirm & Submit".
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh] my-4">
            <Textarea
              value={promptPreview}
              readOnly
              className="min-h-[300px] font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPromptPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};