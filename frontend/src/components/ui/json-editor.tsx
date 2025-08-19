import React from 'react';
// TODO: Re-enable CodeMirror when dependencies are installed
// import CodeMirror from '@uiw/react-codemirror';
// import { json, jsonParseLinter } from '@codemirror/lang-json';
// import { linter } from '@codemirror/lint';
// import { indentOnInput } from '@codemirror/language';
// import { EditorView } from '@codemirror/view';
// import { useTheme } from '@/components/theme-provider';
// import { ThemeMode } from 'shared/types';
import { cn } from '@/lib/utils';

interface JSONEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  className?: string;
  id?: string;
}

export const JSONEditor: React.FC<JSONEditorProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  minHeight = 300,
  className,
  id,
}) => {
  // Fallback to simple textarea until CodeMirror dependencies are installed
  return (
    <div
      id={id}
      className={cn(
        'rounded-md border border-input bg-background overflow-hidden',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          height: `${minHeight}px`,
          fontSize: '14px',
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        }}
        className="w-full p-3 bg-transparent resize-none outline-none"
      />
    </div>
  );
};
