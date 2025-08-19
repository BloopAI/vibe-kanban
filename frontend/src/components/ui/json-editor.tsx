import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter } from '@codemirror/lint';
import { indentOnInput } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { useTheme } from '@/components/theme-provider';
import { ThemeMode } from 'shared/types';
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
  const { theme } = useTheme();

  // Convert app theme to CodeMirror theme
  const getCodeMirrorTheme = () => {
    if (theme === ThemeMode.SYSTEM) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return theme === ThemeMode.DARK ? 'dark' : 'light';
  };

  // Avoid SSR errors
  if (typeof window === 'undefined') return null;

  return (
    <div
      id={id}
      className={cn(
        'rounded-md border border-input bg-background overflow-hidden',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <CodeMirror
        value={value}
        height={`${minHeight}px`}
        basicSetup={{
          lineNumbers: true,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
          searchKeymap: true,
        }}
        extensions={[
          json(),
          linter(jsonParseLinter()),
          indentOnInput(),
          EditorView.lineWrapping,
          disabled ? EditorView.editable.of(false) : [],
        ]}
        theme={getCodeMirrorTheme()}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          fontSize: '14px',
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        }}
      />
    </div>
  );
};
