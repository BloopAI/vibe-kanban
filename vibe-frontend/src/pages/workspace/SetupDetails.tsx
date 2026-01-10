import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Palette, Link } from 'lucide-react';
import type { CreateTenantWorkspace } from '@/types/workspace';

// Color options for workspace
const WORKSPACE_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Yellow', value: '#eab308' },
];

interface SetupDetailsProps {
  data: Partial<CreateTenantWorkspace>;
  onChange: (data: Partial<CreateTenantWorkspace>) => void;
}

export function SetupDetails({ data, onChange }: SetupDetailsProps) {
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugManuallyEdited && data.name) {
      const slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50);
      onChange({ slug });
    }
  }, [data.name, slugManuallyEdited, onChange]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ name: e.target.value });
    },
    [onChange]
  );

  const handleSlugChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSlugManuallyEdited(true);
      const slug = e.target.value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 50);
      onChange({ slug });
    },
    [onChange]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      onChange({ color: data.color === color ? null : color });
    },
    [data.color, onChange]
  );

  return (
    <div className="space-y-8">
      {/* Workspace Name */}
      <div className="space-y-2">
        <Label htmlFor="workspace-name" className="text-base font-medium">
          Workspace Name
        </Label>
        <p className="text-sm text-muted-foreground">
          This is the name of your organization or team.
        </p>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="workspace-name"
            placeholder="Acme Corporation"
            value={data.name || ''}
            onChange={handleNameChange}
            className="pl-10 h-11 text-base"
            autoFocus
          />
        </div>
      </div>

      {/* Workspace URL (slug) */}
      <div className="space-y-2">
        <Label htmlFor="workspace-slug" className="text-base font-medium">
          Workspace URL
        </Label>
        <p className="text-sm text-muted-foreground">
          This will be used in URLs and must be unique.
        </p>
        <div className="relative">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="workspace-slug"
            placeholder="acme-corp"
            value={data.slug || ''}
            onChange={handleSlugChange}
            className="pl-10 h-11 text-base"
          />
        </div>
        {data.slug && (
          <p className="text-xs text-muted-foreground">
            Your workspace will be available at: <span className="font-mono">/w/{data.slug}</span>
          </p>
        )}
      </div>

      {/* Workspace Color */}
      <div className="space-y-2">
        <Label className="text-base font-medium flex items-center gap-2">
          <Palette className="h-4 w-4" />
          Workspace Color
        </Label>
        <p className="text-sm text-muted-foreground">
          Choose a color to identify your workspace.
        </p>
        <div className="flex flex-wrap gap-3 mt-3">
          {WORKSPACE_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => handleColorChange(color.value)}
              className={`
                w-10 h-10 rounded-lg transition-all
                ${data.color === color.value
                  ? 'ring-2 ring-offset-2 ring-primary scale-110'
                  : 'hover:scale-105'
                }
              `}
              style={{ backgroundColor: color.value }}
              title={color.name}
            />
          ))}
        </div>
      </div>

      {/* Preview */}
      {data.name && (
        <div className="p-4 bg-muted/50 rounded-lg border">
          <p className="text-sm text-muted-foreground mb-3">Preview</p>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-lg text-white font-semibold text-lg"
              style={{ backgroundColor: data.color || '#6b7280' }}
            >
              {data.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{data.name}</p>
              <p className="text-sm text-muted-foreground">
                {data.slug || 'workspace-url'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
