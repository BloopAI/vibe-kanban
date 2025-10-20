import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { tagsApi } from '@/lib/api';
import type { TaskTag, CreateTaskTag, UpdateTaskTag } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface TaskTagEditDialogProps {
  tag?: TaskTag | null; // null for create mode
  projectId?: string;
  isGlobal?: boolean;
}

export type TaskTagEditResult = 'saved' | 'canceled';

export const TaskTagEditDialog = NiceModal.create<TaskTagEditDialogProps>(
  ({ tag, projectId, isGlobal = false }) => {
    const modal = useModal();
    const [formData, setFormData] = useState({
      tag_name: '',
      content: '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEditMode = Boolean(tag);

    useEffect(() => {
      if (tag) {
        setFormData({
          tag_name: tag.tag_name,
          content: tag.content || '',
        });
      } else {
        setFormData({
          tag_name: '',
          content: '',
        });
      }
      setError(null);
    }, [tag]);

    const handleSave = async () => {
      if (!formData.tag_name.trim()) {
        setError('Tag name is required');
        return;
      }

      setSaving(true);
      setError(null);

      try {
        if (isEditMode && tag) {
          const updateData: UpdateTaskTag = {
            tag_name: formData.tag_name,
            content: formData.content || null,
          };
          await tagsApi.update(tag.id, updateData);
        } else {
          const createData: CreateTaskTag = {
            project_id: isGlobal ? null : projectId || null,
            tag_name: formData.tag_name,
            content: formData.content || null,
          };
          await tagsApi.create(createData);
        }

        modal.resolve('saved' as TaskTagEditResult);
        modal.hide();
      } catch (err: any) {
        setError(err.message || 'Failed to save tag');
      } finally {
        setSaving(false);
      }
    };

    const handleCancel = () => {
      modal.resolve('canceled' as TaskTagEditResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Tag' : 'Create Tag'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="tag-name">Tag Name</Label>
              <p className="text-xs text-muted-foreground mb-1.5">
                Use this name with @ in task descriptions: @
                {formData.tag_name || 'tag_name'}
              </p>
              <Input
                id="tag-name"
                value={formData.tag_name}
                onChange={(e) =>
                  setFormData({ ...formData, tag_name: e.target.value })
                }
                placeholder="e.g., bug_fix, test_plan, refactor"
                disabled={saving}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="tag-content">Content</Label>
              <p className="text-xs text-muted-foreground mb-1.5">
                Text that will be inserted when you use @
                {formData.tag_name || 'tag_name'} in task descriptions
              </p>
              <Textarea
                id="tag-content"
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                placeholder="Enter the text that will be inserted when you use this tag"
                rows={6}
                disabled={saving}
              />
            </div>
            {error && <Alert variant="destructive">{error}</Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditMode ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
