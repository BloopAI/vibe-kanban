import { FieldProps } from '@rjsf/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';

type KeyValueData = Record<string, string>;

interface EnvFormContext {
  onEnvChange?: (envData: KeyValueData | undefined) => void;
}

export function KeyValueField({
  formData,
  disabled,
  readonly,
  registry,
}: FieldProps<KeyValueData>) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  // Get the custom env change handler from formContext
  const formContext = registry.formContext as EnvFormContext | undefined;

  // Ensure we have a stable object reference
  const data: KeyValueData = useMemo(() => formData ?? {}, [formData]);
  const entries = useMemo(() => Object.entries(data), [data]);

  // Use the formContext handler to update env correctly
  const updateValue = useCallback(
    (newData: KeyValueData | undefined) => {
      formContext?.onEnvChange?.(newData);
    },
    [formContext]
  );

  const handleAdd = useCallback(() => {
    const trimmedKey = newKey.trim();
    if (trimmedKey) {
      updateValue({
        ...data,
        [trimmedKey]: newValue,
      });
      setNewKey('');
      setNewValue('');
    }
  }, [data, newKey, newValue, updateValue]);

  const handleRemove = useCallback(
    (key: string) => {
      const updated = { ...data };
      delete updated[key];
      updateValue(Object.keys(updated).length > 0 ? updated : undefined);
    },
    [data, updateValue]
  );

  const handleValueChange = useCallback(
    (key: string, value: string) => {
      updateValue({ ...data, [key]: value });
    },
    [data, updateValue]
  );

  const isDisabled = disabled || readonly;

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 items-center">
          <Input
            value={key}
            disabled
            className="flex-1 font-mono text-sm"
            aria-label="Environment variable key"
          />
          <Input
            value={value ?? ''}
            onChange={(e) => handleValueChange(key, e.target.value)}
            disabled={isDisabled}
            className="flex-1 font-mono text-sm"
            placeholder="Value"
            aria-label={`Value for ${key}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleRemove(key)}
            disabled={isDisabled}
            className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            aria-label={`Remove ${key}`}
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
          disabled={isDisabled}
          placeholder="KEY"
          className="flex-1 font-mono text-sm"
          aria-label="New environment variable key"
        />
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          disabled={isDisabled}
          placeholder="value"
          className="flex-1 font-mono text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          aria-label="New environment variable value"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={isDisabled || !newKey.trim()}
          className="h-8 w-8 p-0 shrink-0"
          aria-label="Add environment variable"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
