import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { templatesApi } from '@/lib/api';
import type {
  TaskTemplate,
  CreateTaskTemplate,
  UpdateTaskTemplate,
} from 'shared/types';

interface TaskTemplateManagerProps {
  projectId?: string;
  isGlobal?: boolean;
}

export function TaskTemplateManager({
  projectId,
  isGlobal = false,
}: TaskTemplateManagerProps) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(
    null
  );
  const [formData, setFormData] = useState({
    template_name: '',
    title: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = isGlobal
        ? await templatesApi.listGlobal()
        : projectId
          ? await templatesApi.listByProject(projectId)
          : [];

      // Filter to show only templates for this specific scope
      const filtered = data.filter((template) =>
        isGlobal
          ? template.project_id === null
          : template.project_id === projectId
      );

      setTemplates(filtered);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  }, [isGlobal, projectId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleOpenDialog = useCallback((template?: TaskTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        template_name: template.template_name,
        title: template.title,
        description: template.description || '',
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        template_name: '',
        title: '',
        description: '',
      });
    }
    setError(null);
    setIsDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setEditingTemplate(null);
    setFormData({
      template_name: '',
      title: '',
      description: '',
    });
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.template_name.trim() || !formData.title.trim()) {
      setError('Template name and title are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingTemplate) {
        const updateData: UpdateTaskTemplate = {
          template_name: formData.template_name,
          title: formData.title,
          description: formData.description || null,
        };
        await templatesApi.update(editingTemplate.id, updateData);
      } else {
        const createData: CreateTaskTemplate = {
          project_id: isGlobal ? null : projectId || null,
          template_name: formData.template_name,
          title: formData.title,
          description: formData.description || null,
        };
        await templatesApi.create(createData);
      }
      await fetchTemplates();
      handleCloseDialog();
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }, [
    formData,
    editingTemplate,
    isGlobal,
    projectId,
    fetchTemplates,
    handleCloseDialog,
  ]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Command/Ctrl + Enter to save template
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        if (isDialogOpen && !saving) {
          event.preventDefault();
          handleSave();
        }
      }
    };

    if (isDialogOpen) {
      document.addEventListener('keydown', handleKeyDown, true); // Use capture phase for priority
      return () => document.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [isDialogOpen, saving, handleSave]);

  const handleDelete = useCallback(
    async (template: TaskTemplate) => {
      if (
        !confirm(
          `Are you sure you want to delete the template "${template.template_name}"?`
        )
      ) {
        return;
      }

      try {
        await templatesApi.delete(template.id);
        await fetchTemplates();
      } catch (err) {
        console.error('Failed to delete template:', err);
      }
    },
    [fetchTemplates]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          {isGlobal ? 'Global Task Templates' : 'Project Task Templates'}
        </h3>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No templates yet. Create your first template to get started.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full">
              <thead className="border-b bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 text-sm font-medium">
                    Template Name
                  </th>
                  <th className="text-left p-2 text-sm font-medium">Title</th>
                  <th className="text-left p-2 text-sm font-medium">
                    Description
                  </th>
                  <th className="text-right p-2 text-sm font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr
                    key={template.id}
                    className="border-b hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-2 text-sm font-medium">
                      {template.template_name}
                    </td>
                    <td className="p-2 text-sm">{template.title}</td>
                    <td className="p-2 text-sm">
                      <div
                        className="max-w-[200px] truncate"
                        title={template.description || ''}
                      >
                        {template.description || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleOpenDialog(template)}
                          title="Edit template"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(template)}
                          title="Delete template"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Template' : 'Create Template'}
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
              />
            </div>
            <div>
              <Label htmlFor="template-description">Default Description</Label>
              <Textarea
                id="template-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Enter a default description for tasks created with this template"
                rows={4}
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseDialog}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
