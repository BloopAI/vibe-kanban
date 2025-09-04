import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import RawLogText from '@/components/common/RawLogText';
import { Braces, FileText } from 'lucide-react';

type JsonValue = any;

type ToolResult = {
  type: 'markdown' | 'json';
  value: JsonValue;
};

type Props = {
  arguments?: JsonValue | null;
  result?: ToolResult | null;
  commandOutput?: string | null; // presence => command mode
  commandExit?:
    | { type: 'success'; success: boolean }
    | { type: 'exit_code'; code: number }
    | null;
};

export default function ToolDetails({
  arguments: args,
  result,
  commandOutput,
}: Props) {
  const isCommandMode = commandOutput !== undefined;

  const renderJson = (v: JsonValue) => (
    <pre className="mt-1 max-h-80 overflow-auto rounded bg-muted p-2 text-xs">
      {JSON.stringify(v, null, 2)}
    </pre>
  );

  return (
    <div className="mt-2 space-y-3">
      {args && (
        <section>
          {!isCommandMode ? (
            <>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Braces className="h-3 w-3" />
                <span>Arguments</span>
              </div>
              {renderJson(args)}
            </>
          ) : (
            <>
              <RawLogText
                content={
                  typeof args === 'string'
                    ? args
                    : JSON.stringify(args, null, 2)
                }
              />
            </>
          )}
        </section>
      )}

      {result && !isCommandMode && (
        <section>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {result.type === 'json' ? (
              <Braces className="h-3 w-3" />
            ) : (
              <FileText className="h-3 w-3" />
            )}
            <span>Result</span>
          </div>
          <div className="mt-1">
            {result.type === 'markdown' ? (
              <MarkdownRenderer content={String(result.value ?? '')} />
            ) : (
              renderJson(result.value)
            )}
          </div>
        </section>
      )}

      {isCommandMode && (
        <section>
          <div className="mt-1">
            <RawLogText content={commandOutput ?? ''} />
          </div>
        </section>
      )}
    </div>
  );
}
