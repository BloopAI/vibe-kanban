import { useEffect, useState, useRef } from 'react';

interface MermaidDiagramProps {
  chart: string;
  theme: 'light' | 'dark';
}

// Serialize all mermaid operations to avoid concurrent render/initialize races
let mermaidQueue: Promise<void> = Promise.resolve();
let initializedTheme: string | null = null;

export function MermaidDiagram({ chart, theme }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const renderCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const renderId = ++renderCountRef.current;

    mermaidQueue = mermaidQueue.then(async () => {
      if (cancelled) return;

      try {
        const { default: mermaid } = await import('mermaid');
        const mermaidTheme = theme === 'dark' ? 'dark' : 'default';

        if (initializedTheme !== mermaidTheme) {
          mermaid.initialize({
            startOnLoad: false,
            theme: mermaidTheme,
            securityLevel: 'strict',
          });
          initializedTheme = mermaidTheme;
        }

        // Use renderId to ensure each render call gets a unique DOM element ID
        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${renderId}-${Date.now()}`,
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
    });

    return () => {
      cancelled = true;
    };
  }, [chart, theme]);

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
      className="my-3 flex justify-center overflow-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
