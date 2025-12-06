import { FieldProps } from '@rjsf/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';

export function KeyValueField(props: FieldProps) {
  const { formData = {}, onChange, disabled, readonly } = props;
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const entries = Object.entries(formData as Record<string, string>);

  const handleChange = (newData: Record<string, string> | undefined) => {
    // FieldProps onChange requires (value, path, errorSchema?, id?)
    onChange(newData, []);
  };

  const handleAdd = () => {
    if (newKey.trim()) {
      handleChange({
        ...(formData as Record<string, string>),
        [newKey.trim()]: newValue,
      });
      setNewKey('');
      setNewValue('');
    }
  };

  const handleRemove = (key: string) => {
    const updated = { ...(formData as Record<string, string>) };
    delete updated[key];
    handleChange(Object.keys(updated).length > 0 ? updated : undefined);
  };

  const handleValueChange = (key: string, value: string) => {
    handleChange({ ...(formData as Record<string, string>), [key]: value });
  };

  // Only render the key-value editor - FieldTemplate handles the label/description
  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 items-center">
          <Input value={key} disabled className="flex-1 font-mono text-sm" />
          <Input
            value={value}
            onChange={(e) => handleValueChange(key, e.target.value)}
            disabled={disabled || readonly}
            className="flex-1 font-mono text-sm"
            placeholder="Value"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleRemove(key)}
            disabled={disabled || readonly}
            className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}

      {/* Add new entry row */}
      <div className="flex gap-2 items-center">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          disabled={disabled || readonly}
          placeholder="KEY"
          className="flex-1 font-mono text-sm"
        />
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          disabled={disabled || readonly}
          placeholder="value"
          className="flex-1 font-mono text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled || readonly || !newKey.trim()}
          className="h-8 w-8 p-0 shrink-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
