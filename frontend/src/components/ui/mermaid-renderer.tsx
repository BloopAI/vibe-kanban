import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import mermaid from 'mermaid';
import { Maximize2, Share2 } from 'lucide-react';
import { deflate } from 'pako';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface MermaidRendererProps {
  code: string;
  className?: string;
}

let mermaidInitialized = false;

const toUrlSafeBase64 = (u8a: Uint8Array): string => {
  return btoa(String.fromCharCode(...u8a))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

const MermaidRenderer: React.FC<MermaidRendererProps> = ({
  code,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleShare = () => {
    const state = { code };
    const json = JSON.stringify(state);
    const data = new TextEncoder().encode(json);
    const compressed = deflate(data, { level: 9 });
    const base64 = toUrlSafeBase64(compressed);
    const url = `https://mermaid.live/edit#pako:${base64}`;
    window.open(url, '_blank');
  };

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
      });
      mermaidInitialized = true;
    }
  }, []);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current || !code) return;

      try {
        setError(null);
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, code);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to render diagram'
        );
      }
    };

    renderDiagram();
  }, [code]);

  useEffect(() => {
    const renderFullscreenDiagram = async () => {
      if (!fullscreenContainerRef.current || !code || !isFullscreen) return;

      try {
        const id = `mermaid-fullscreen-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, code);
        if (fullscreenContainerRef.current) {
          fullscreenContainerRef.current.innerHTML = svg;
        }
      } catch (err) {
        console.error('Mermaid fullscreen rendering error:', err);
      }
    };

    renderFullscreenDiagram();
  }, [code, isFullscreen]);

  if (error) {
    return (
      <div className="text-red-500 text-sm p-2 border border-red-400 rounded">
        <div className="font-semibold">Failed to render mermaid diagram:</div>
        <pre className="text-xs mt-1">{error}</pre>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <div className="absolute top-2 right-2 flex gap-2 z-10">
          <button
            onClick={handleShare}
            className="p-1.5 bg-background/80 hover:bg-background border rounded opacity-70 hover:opacity-100 transition-opacity"
            title="View & Share on Web"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1.5 bg-background/80 hover:bg-background border rounded opacity-70 hover:opacity-100 transition-opacity"
            title="View fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <div
          ref={containerRef}
          className={`mermaid-container ${className}`}
          style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}
        />
      </div>

      {isFullscreen &&
        createPortal(
          <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
            <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Mermaid Diagram</DialogTitle>
              </DialogHeader>
              <div
                ref={fullscreenContainerRef}
                className="mermaid-container flex justify-center p-4"
              />
            </DialogContent>
          </Dialog>,
          document.body
        )}
    </>
  );
};

export default MermaidRenderer;
