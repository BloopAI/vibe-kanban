import type {
  ArrayFieldTemplateProps,
  ArrayFieldItemTemplateProps,
} from '@rjsf/utils';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';

export const ArrayFieldTemplate = (props: ArrayFieldTemplateProps) => {
  const { canAdd, items, onAddClick, disabled, readonly } = props;

  if (!items || (items.length === 0 && !canAdd)) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>{items}</div>

      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddClick}
          disabled={disabled || readonly}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      )}
    </div>
  );
};

export const ArrayFieldItemTemplate = (props: ArrayFieldItemTemplateProps) => {
  const { children, buttonsProps, disabled, readonly } = props;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">{children}</div>

      {/* Remove button */}
      {buttonsProps.hasRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={buttonsProps.onRemoveItem}
          disabled={disabled || readonly || buttonsProps.disabled}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 shrink-0"
          title="Remove item"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};
