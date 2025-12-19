import * as React from 'react';
import {
  PencilSimpleLineIcon,
  CheckIcon,
  ArrowCounterClockwiseIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function EditableText({
  value,
  onChange,
  placeholder,
  className,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(value);
  const [justSaved, setJustSaved] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync editValue when value prop changes (and not editing)
  React.useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  // Focus input when entering edit mode
  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Clear justSaved after 2 seconds
  React.useEffect(() => {
    if (justSaved) {
      const timer = setTimeout(() => {
        setJustSaved(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [justSaved]);

  const handleSave = () => {
    setIsEditing(false);
    if (editValue !== value) {
      onChange(editValue);
      setJustSaved(true);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div
      className={cn(
        'bg-secondary border rounded-sm px-base py-half flex items-center gap-base transition-colors',
        justSaved
          ? 'border-success'
          : isEditing
            ? 'border-brand'
            : 'border-border',
        className
      )}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 text-base text-high bg-transparent placeholder:text-low placeholder:opacity-80 focus:outline-none min-w-0"
        />
      ) : (
        <span className="flex-1 text-base text-normal truncate min-w-0">
          {value || <span className="text-low opacity-80">{placeholder}</span>}
        </span>
      )}
      {justSaved ? (
        <CheckIcon
          className="size-icon-sm text-success shrink-0"
          weight="bold"
        />
      ) : isEditing ? (
        <>
          <ArrowCounterClockwiseIcon
            className="size-icon-sm text-low shrink-0 cursor-pointer hover:text-normal"
            weight="bold"
            onMouseDown={(e) => {
              e.preventDefault();
              handleCancel();
            }}
          />
          <CheckIcon
            className="size-icon-sm text-low shrink-0 cursor-pointer hover:text-normal"
            weight="bold"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSave();
            }}
          />
        </>
      ) : (
        <PencilSimpleLineIcon
          className="size-icon-sm text-low shrink-0 cursor-pointer hover:text-normal"
          weight="regular"
          onClick={() => setIsEditing(true)}
        />
      )}
    </div>
  );
}
