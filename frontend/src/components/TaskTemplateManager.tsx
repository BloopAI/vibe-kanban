import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { templatesApi } from '@/lib/api';
import { showTaskTemplateEdit } from '@/lib/modals';
import type { TaskTemplate } from 'shared/types';

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

  const handleOpenDialog = useCallback(
    async (template?: TaskTemplate) => {
      try {
        const result = await showTaskTemplateEdit({
          template: template || null,
          projectId,
          isGlobal,
        });

        if (result === 'saved') {
          await fetchTemplates();
        }
      } catch (error) {
        // User cancelled - do nothing
      }
    },
    [projectId, isGlobal, fetchTemplates]
  );

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
    </div>
  );
}
