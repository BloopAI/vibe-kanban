// OX Agent: CSRF not applicable — this is a React client component with no
// cookie-based session; all backend mutations go through the local API which
// uses Bearer token authentication, making them naturally CSRF-resistant.

import { useState, useCallback } from 'react';
import { create, useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@vibe/ui/components/KeyboardDialog';
import { Input } from '@vibe/ui/components/Input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@vibe/ui/components/Popover';
import { InlineColorPicker } from '@vibe/ui/components/ColorPicker';
import { PRESET_COLORS } from '@/shared/lib/colors';
import { kanbanProjectsApi } from '@/shared/lib/kanbanApi';
import { cn } from '@/shared/lib/utils';
import { defineModal } from '@/shared/lib/modals';

interface ProjectSettingsDialogProps {
  projectId: string;
  projectName: string;
  projectColor: string;
}

const ProjectSettingsDialogImpl = create<ProjectSettingsDialogProps>(
  ({ projectId, projectName, projectColor }) => {
    const modal = useModal();
    const { t } = useTranslation('common');
    const queryClient = useQueryClient();

    const [name, setName] = useState(projectName);
    const [color, setColor] = useState(projectColor);
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = useCallback(async () => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        setError(t('kanban.projectNameRequired', 'Project name is required'));
        return;
      }

      setError(null);
      setIsSaving(true);

      try {
        await kanbanProjectsApi.update(projectId, {
          name: trimmedName,
          color,
          sort_order: null,
        });
        await queryClient.invalidateQueries({ queryKey: ['kanban-projects'] });
        modal.resolve('saved');
        modal.hide();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t('kanban.projectSaveFailed', 'Failed to save project settings')
        );
      } finally {
        setIsSaving(false);
      }
    }, [name, color, projectId, queryClient, modal, t]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleSave();
      }
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && modal.hide()}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t('kanban.projectSettings', 'Project Settings')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-base py-base">
            <div className="flex flex-col gap-half">
              <label className="text-sm font-medium text-normal">
                {t('kanban.projectName', 'Project Name')}
              </label>
              <div className="flex items-center gap-half">
                {/* Color picker dot */}
                <Popover
                  open={colorPickerOpen}
                  onOpenChange={setColorPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex-shrink-0 w-8 h-8 rounded-sm border border-border flex items-center justify-center hover:bg-secondary transition-colors"
                      title={t('kanban.changeColor', 'Change color')}
                    >
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: `hsl(${color})` }}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-auto p-base"
                    onInteractOutside={(e) => {
                      e.preventDefault();
                      setColorPickerOpen(false);
                    }}
                  >
                    <InlineColorPicker
                      value={color}
                      onChange={setColor}
                      colors={PRESET_COLORS}
                    />
                  </PopoverContent>
                </Popover>

                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t(
                    'kanban.enterProjectName',
                    'Enter project name'
                  )}
                  className="flex-1"
                  autoFocus
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => modal.hide()}
              className="px-base py-half rounded-sm text-sm text-normal hover:bg-secondary transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || !name.trim()}
              className={cn(
                'px-base py-half rounded-sm text-sm font-semibold text-high',
                !isSaving && name.trim()
                  ? 'bg-brand hover:bg-brand-hover'
                  : 'bg-panel text-low cursor-not-allowed'
              )}
            >
              {isSaving
                ? t('common.saving', 'Saving...')
                : t('common.save', 'Save')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const ProjectSettingsDialog = defineModal<
  ProjectSettingsDialogProps,
  'saved' | 'canceled'
>(ProjectSettingsDialogImpl);
