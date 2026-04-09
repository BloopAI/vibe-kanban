import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { templatesApi } from '@/lib/api';
import { TemplateEditDialog } from '@/components/dialogs/tasks/TemplateEditDialog';
import type { Template } from 'shared/types';

export function TemplateManager() {
  const { t } = useTranslation('settings');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await templatesApi.list();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleOpenDialog = useCallback(
    async (template?: Template) => {
      try {
        const result = await TemplateEditDialog.show({
          template: template || null,
        });

        if (result === 'saved') {
          await fetchTemplates();
        }
      } catch (_error) {
        // User cancelled - do nothing
      }
    },
    [fetchTemplates]
  );

  const handleDelete = useCallback(
    async (template: Template) => {
      if (
        !confirm(
          t('settings.general.templates.manager.deleteConfirm', {
            templateName: template.template_name,
          })
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
    [fetchTemplates, t]
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
          {t('settings.general.templates.manager.title')}
        </h3>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t('settings.general.templates.manager.addTemplate')}
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t('settings.general.templates.manager.noTemplates')}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full">
              <thead className="border-b bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 text-sm font-medium">
                    {t('settings.general.templates.manager.table.templateName')}
                  </th>
                  <th className="text-left p-2 text-sm font-medium">
                    {t('settings.general.templates.manager.table.content')}
                  </th>
                  <th className="text-right p-2 text-sm font-medium">
                    {t('settings.general.templates.manager.table.actions')}
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
                      @{template.template_name}
                    </td>
                    <td className="p-2 text-sm">
                      <div
                        className="max-w-[400px] truncate"
                        title={template.content || ''}
                      >
                        {template.content || (
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
                          title={t(
                            'settings.general.templates.manager.actions.editTemplate'
                          )}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(template)}
                          title={t(
                            'settings.general.templates.manager.actions.deleteTemplate'
                          )}
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
