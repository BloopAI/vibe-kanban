import { useEffect, useRef, useState, useId } from 'react';

interface MermaidDiagramProps {
  chart: string;
  theme: 'light' | 'dark';
}

export function MermaidDiagram({ chart, theme }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const id = useId().replace(/:/g, 'mm');

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === 'dark' ? 'dark' : 'default',
          securityLevel: 'strict',
        });

        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${id}`,
          chart
        );

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to render diagram'
          );
          setSvg('');
        }
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [chart, theme, id]);

  if (error) {
    return (
      <div className="rounded-sm border border-error/20 bg-error/5 p-base">
        <p className="text-xs text-error mb-2">Mermaid diagram error</p>
        <pre className="text-xs text-low overflow-auto">
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center p-base text-low text-sm">
        Loading diagram…
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-3 flex justify-center overflow-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
