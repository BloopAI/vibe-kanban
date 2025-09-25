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
import { templatesApi } from '@/lib/api';
import type {
  TaskTemplate,
  CreateTaskTemplate,
  UpdateTaskTemplate,
} from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface TaskTemplateEditDialogProps {
  template?: TaskTemplate | null; // null for create mode
  projectId?: string;
  isGlobal?: boolean;
}

export type TaskTemplateEditResult = 'saved' | 'canceled';

export const TaskTemplateEditDialog =
  NiceModal.create<TaskTemplateEditDialogProps>(
    ({ template, projectId, isGlobal = false }) => {
      const modal = useModal();
      const [formData, setFormData] = useState({
        template_name: '',
        title: '',
        description: '',
      });
      const [saving, setSaving] = useState(false);
      const [error, setError] = useState<string | null>(null);

      const isEditMode = Boolean(template);

      useEffect(() => {
        if (template) {
          setFormData({
            template_name: template.template_name,
            title: template.title,
            description: template.description || '',
          });
        } else {
          setFormData({
            template_name: '',
            title: '',
            description: '',
          });
        }
        setError(null);
      }, [template]);

      const handleSave = async () => {
        if (!formData.template_name.trim() || !formData.title.trim()) {
          setError('Template name and title are required');
          return;
        }

        setSaving(true);
        setError(null);

        try {
          if (isEditMode && template) {
            const updateData: UpdateTaskTemplate = {
              template_name: formData.template_name,
              title: formData.title,
              description: formData.description || null,
            };
            await templatesApi.update(template.id, updateData);
          } else {
            const createData: CreateTaskTemplate = {
              project_id: isGlobal ? null : projectId || null,
              template_name: formData.template_name,
              title: formData.title,
              description: formData.description || null,
            };
            await templatesApi.create(createData);
          }

          modal.resolve('saved' as TaskTemplateEditResult);
          modal.hide();
        } catch (err: any) {
          setError(err.message || 'Failed to save template');
        } finally {
          setSaving(false);
        }
      };

      const handleCancel = () => {
        modal.resolve('canceled' as TaskTemplateEditResult);
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
              <DialogTitle>
                {isEditMode ? 'Edit Template' : 'Create Template'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={formData.template_name}
                  onChange={(e) =>
                    setFormData({ ...formData, template_name: e.target.value })
                  }
                  placeholder="e.g., Bug Fix, Feature Request"
                  disabled={saving}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="template-title">Default Title</Label>
                <Input
                  id="template-title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="e.g., Fix bug in..."
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="template-description">
                  Default Description
                </Label>
                <Textarea
                  id="template-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Enter a default description for tasks created with this template"
                  rows={4}
                  disabled={saving}
                />
              </div>
              {error && <Alert variant="destructive">{error}</Alert>}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
              >
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
