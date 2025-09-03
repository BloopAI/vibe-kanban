import { ArrayFieldTemplateProps, ArrayFieldTemplateItemType } from '@rjsf/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';

export const ArrayFieldTemplate = (props: ArrayFieldTemplateProps) => {
  const {
    canAdd,
    items,
    onAddClick,
    disabled,
    readonly,
    title,
    required,
    schema,
  } = props;

  if (!items || items.length === 0 && !canAdd) {
    return null;
  }

  return (
    <div className="space-y-4">
      {title && (
        <Label className="text-sm font-medium">
          {title}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}

      {schema.description && (
        <p className="text-sm text-muted-foreground">
          {schema.description}
        </p>
      )}

      <div className="space-y-3">
        {items.length > 0 && items.map((element: ArrayFieldTemplateItemType) => (
          <ArrayItem
            key={element.key}
            element={element}
            disabled={disabled}
            readonly={readonly}
          />
        ))}
      </div>

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

interface ArrayItemProps {
  element: ArrayFieldTemplateItemType;
  disabled?: boolean;
  readonly?: boolean;
}

const ArrayItem = ({ element, disabled, readonly }: ArrayItemProps) => {
  const { children } = element;
  const elementAny = element as any; // Type assertion to access RJSF properties

  return (
    <div className="flex items-start gap-2 p-3 border rounded-md bg-card">
      {/* Field content */}
      <div className="flex-1 min-w-0">
        {children}
      </div>

      {/* Remove button */}
      {elementAny.hasRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => elementAny.onDropIndexClick(elementAny.index)}
          disabled={disabled || readonly}
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          title="Remove"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};
