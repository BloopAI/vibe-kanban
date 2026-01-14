import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { TagIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { defineModal } from '@/lib/modals';
import { cn } from '@/lib/utils';

export interface BulkTagDialogProps {
  projectId?: string;
  selectedTaskIds?: string[];
}

export type BulkTagResult = 'tagged' | 'canceled';

const suggestedTags = [
  { name: 'bug', color: 'bg-red-500' },
  { name: 'feature', color: 'bg-blue-500' },
  { name: 'enhancement', color: 'bg-green-500' },
  { name: 'documentation', color: 'bg-purple-500' },
  { name: 'urgent', color: 'bg-orange-500' },
  { name: 'blocked', color: 'bg-yellow-500' },
];

const BulkTagDialogImpl = NiceModal.create<BulkTagDialogProps>((props) => {
  const modal = useModal();
  const { selectedTaskIds = [] } = props;
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags([...selectedTags, trimmed]);
    }
    setNewTag('');
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tag));
  };

  const handleApply = async () => {
    if (selectedTags.length === 0) return;

    setIsApplying(true);
    try {
      // TODO: Implement actual tag application logic
      console.log('Applying tags:', selectedTags, 'to tasks:', selectedTaskIds);

      modal.resolve('tagged' as BulkTagResult);
      modal.hide();
    } catch (error) {
      console.error('Tag application failed:', error);
    } finally {
      setIsApplying(false);
    }
  };

  const handleCancel = () => {
    modal.resolve('canceled' as BulkTagResult);
    modal.hide();
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <TagIcon className="h-6 w-6 text-brand" />
            <DialogTitle>Bulk Tag Tasks</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Apply tags to{' '}
            {selectedTaskIds.length > 0
              ? `${selectedTaskIds.length} selected tasks`
              : 'all visible tasks'}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Selected tags */}
          {selectedTags.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                Tags to apply
              </label>
              <div className="flex flex-wrap gap-1.5">
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
                      'text-xs font-medium',
                      'bg-brand/10 text-brand'
                    )}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:bg-brand/20 rounded-full p-0.5"
                    >
                      <XIcon className="size-icon-xs" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Add new tag input */}
          <div>
            <label className="text-sm font-medium mb-2 block">Add tag</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag(newTag);
                  }
                }}
                placeholder="Enter tag name..."
                className={cn(
                  'flex-1 px-3 py-2 rounded-md border border-input',
                  'bg-transparent text-sm',
                  'placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleAddTag(newTag)}
                disabled={!newTag.trim()}
              >
                <PlusIcon className="size-icon-sm" />
              </Button>
            </div>
          </div>

          {/* Suggested tags */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Suggested tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {suggestedTags
                .filter((tag) => !selectedTags.includes(tag.name))
                .map((tag) => (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() => handleAddTag(tag.name)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2 py-1 rounded-md',
                      'text-xs font-medium',
                      'border border-input',
                      'hover:border-brand/50 hover:bg-muted/50',
                      'transition-colors duration-150'
                    )}
                  >
                    <span className={cn('size-dot rounded-full', tag.color)} />
                    {tag.name}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={selectedTags.length === 0 || isApplying}
          >
            {isApplying
              ? 'Applying...'
              : `Apply ${selectedTags.length} Tag${selectedTags.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const BulkTagDialog = defineModal<BulkTagDialogProps, BulkTagResult>(
  BulkTagDialogImpl
);
