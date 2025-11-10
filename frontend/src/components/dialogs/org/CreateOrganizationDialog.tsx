import { useState, useEffect } from 'react';
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
import { organizationsApi } from '@/lib/api';

export type CreateOrganizationResult = {
  action: 'created' | 'canceled';
  organizationId?: string;
};

export const CreateOrganizationDialog = NiceModal.create(() => {
  const modal = useModal();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isManualSlug, setIsManualSlug] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Reset form when dialog opens
    if (modal.visible) {
      setName('');
      setSlug('');
      setIsManualSlug(false);
      setError(null);
      setIsSubmitting(false);
    }
  }, [modal.visible]);

  // Auto-generate slug from name if not manually edited
  useEffect(() => {
    if (!isManualSlug && name) {
      const generatedSlug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      setSlug(generatedSlug);
    }
  }, [name, isManualSlug]);

  const validateName = (value: string): string | null => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return 'Organization name is required';
    if (trimmedValue.length < 3)
      return 'Organization name must be at least 3 characters';
    if (trimmedValue.length > 50)
      return 'Organization name must be 50 characters or less';
    return null;
  };

  const validateSlug = (value: string): string | null => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return 'Slug is required';
    if (trimmedValue.length < 3) return 'Slug must be at least 3 characters';
    if (trimmedValue.length > 50) return 'Slug must be 50 characters or less';
    if (!/^[a-z0-9-]+$/.test(trimmedValue)) {
      return 'Slug can only contain lowercase letters, numbers, and hyphens';
    }
    if (trimmedValue.startsWith('-') || trimmedValue.endsWith('-')) {
      return 'Slug cannot start or end with a hyphen';
    }
    return null;
  };

  const handleCreate = async () => {
    const nameError = validateName(name);
    if (nameError) {
      setError(nameError);
      return;
    }

    const slugError = validateSlug(slug);
    if (slugError) {
      setError(slugError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await organizationsApi.createOrganization({
        name: name.trim(),
        slug: slug.trim(),
      });

      modal.resolve({
        action: 'created',
        organizationId: response.organization.id,
      } as CreateOrganizationResult);
      modal.hide();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create organization'
      );
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    modal.resolve({ action: 'canceled' } as CreateOrganizationResult);
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsManualSlug(true);
    setSlug(e.target.value);
    setError(null);
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Organization</DialogTitle>
          <DialogDescription>
            Create a new organization to collaborate with your team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g., Acme Corporation"
              maxLength={50}
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={handleSlugChange}
              placeholder="e.g., acme-corporation"
              maxLength={50}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Used in URLs. Lowercase letters, numbers, and hyphens only.
            </p>
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
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !slug.trim() || isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Organization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
