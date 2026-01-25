import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { defineModal } from '@/lib/modals';
import { useEntity } from '@/lib/electric/hooks';
import { PROJECT_ENTITY, type Project } from 'shared/remote-types';

export type CreateRemoteProjectDialogProps = {
  organizationId: string;
};

export type CreateRemoteProjectResult = {
  action: 'created' | 'canceled';
  project?: Project;
};

// Generate a random HSL color string for projects
function generateRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 65 + Math.floor(Math.random() * 20); // 65-85%
  const lightness = 45 + Math.floor(Math.random() * 15); // 45-60%
  return `${hue} ${saturation}% ${lightness}%`;
}

// Convert HSL string (e.g., "180 75% 52%") to hex color
function hslToHex(hsl: string): string {
  const [h, s, l] = hsl.split(' ').map((v, i) => {
    const num = parseFloat(v);
    return i === 0 ? num : num / 100;
  });

  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Convert hex color to HSL string (e.g., "#3b82f6" -> "217 91% 60%")
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const CreateRemoteProjectDialogImpl =
  NiceModal.create<CreateRemoteProjectDialogProps>(({ organizationId }) => {
    const modal = useModal();
    const { t } = useTranslation('projects');
    const [name, setName] = useState('');
    const [color, setColor] = useState<string>(() => generateRandomColor());
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const params = useMemo(
      () => ({ organization_id: organizationId }),
      [organizationId]
    );

    const { insert, error: entityError } = useEntity(PROJECT_ENTITY, params);

    useEffect(() => {
      // Reset form when dialog opens
      if (modal.visible) {
        setName('');
        setColor(generateRandomColor());
        setError(null);
        setIsCreating(false);
      }
    }, [modal.visible]);

    useEffect(() => {
      if (entityError) {
        setError(entityError.message || 'Failed to create project');
        setIsCreating(false);
      }
    }, [entityError]);

    const validateName = (value: string): string | null => {
      const trimmedValue = value.trim();
      if (!trimmedValue) return 'Project name is required';
      if (trimmedValue.length < 2)
        return 'Project name must be at least 2 characters';
      if (trimmedValue.length > 100)
        return 'Project name must be 100 characters or less';
      return null;
    };

    const handleCreate = () => {
      const nameError = validateName(name);
      if (nameError) {
        setError(nameError);
        return;
      }

      setError(null);
      setIsCreating(true);

      try {
        const project = insert({
          organization_id: organizationId,
          name: name.trim(),
          color: color,
        });

        modal.resolve({
          action: 'created',
          project,
        } as CreateRemoteProjectResult);
        modal.hide();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to create project'
        );
        setIsCreating(false);
      }
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as CreateRemoteProjectResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && name.trim() && !isCreating) {
        e.preventDefault();
        handleCreate();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('createProjectDialog.title', 'Create Project')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'createProjectDialog.description',
                'Create a new project in this organization.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">
                {t('createProjectDialog.nameLabel', 'Project name')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={t(
                    'createProjectDialog.namePlaceholder',
                    'Enter project name'
                  )}
                  maxLength={100}
                  autoFocus
                  disabled={isCreating}
                  className="flex-1"
                />
                <input
                  type="color"
                  id="project-color"
                  value={hslToHex(color)}
                  onChange={(e) => setColor(hexToHsl(e.target.value))}
                  className="w-10 h-10 border rounded cursor-pointer shrink-0"
                  disabled={isCreating}
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isCreating}
            >
              {t('common:buttons.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
            >
              {isCreating
                ? t('createProjectDialog.creating', 'Creating...')
                : t('createProjectDialog.createButton', 'Create Project')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

export const CreateRemoteProjectDialog = defineModal<
  CreateRemoteProjectDialogProps,
  CreateRemoteProjectResult
>(CreateRemoteProjectDialogImpl);
