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
  commandOutput?: string | null;
  commandExit?:
    | { type: 'success'; success: boolean }
    | { type: 'exit_code'; code: number }
    | null;
};

export default function ToolDetails({
  arguments: args,
  result,
  commandOutput,
  commandExit,
}: Props) {
  const renderJson = (v: JsonValue) => (
    <pre className="mt-1 max-h-80 overflow-auto rounded bg-muted p-2 text-xs">
      {JSON.stringify(v, null, 2)}
    </pre>
  );

  return (
    <div className="mt-2 space-y-3">
      {args && (
        <section>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Braces className="h-3 w-3" />
            <span>Arguments</span>
          </div>
          {renderJson(args)}
        </section>
      )}
      {result && (
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
      {(commandOutput || commandExit) && (
        <section>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <FileText className="h-3 w-3" />
            <span>
              Output
              {commandExit && (
                <>
                  {' '}
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80 whitespace-nowrap">
                    {commandExit.type === 'exit_code'
                      ? `exit ${commandExit.code}`
                      : commandExit.success
                        ? 'ok'
                        : 'fail'}
                  </span>
                </>
              )}
            </span>
          </div>
          {commandOutput && (
            <div className="mt-1">
              <RawLogText content={commandOutput} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
