import { useState, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Maximize, Move, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageViewerProps {
  src: string;
  alt?: string;
  className?: string;
}

export function ImageViewer({ src, alt = 'Image', className }: ImageViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset position when zoom changes
  useEffect(() => {
    if (zoom <= 100) {
      setPosition({ x: 0, y: 0 });
    }
  }, [zoom]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 25, 400));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 25, 25));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const handleReset = useCallback(() => {
    setZoom(100);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current || !imageSize.width || !imageSize.height) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth - 48; // Padding
    const containerHeight = container.clientHeight - 48;

    const widthRatio = containerWidth / imageSize.width;
    const heightRatio = containerHeight / imageSize.height;
    const fitZoom = Math.min(widthRatio, heightRatio) * 100;

    setZoom(Math.min(Math.max(Math.floor(fitZoom), 25), 100));
    setPosition({ x: 0, y: 0 });
  }, [imageSize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 100) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [zoom, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom(prev => Math.min(prev + 10, 400));
    } else {
      setZoom(prev => Math.max(prev - 10, 25));
    }
  }, []);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Toolbar */}
      <div className="shrink-0 p-3 border-b bg-muted/30">
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoom <= 25}
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>

            <input
              type="range"
              value={zoom}
              onChange={(e) => setZoom(parseInt(e.target.value, 10))}
              min={25}
              max={400}
              step={5}
              className="w-32 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
            />

            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoom >= 400}
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            <span className="text-sm text-muted-foreground w-14 text-center">
              {zoom}%
            </span>
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRotate}
              title="Rotate 90°"
            >
              <RotateCw className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleFitToScreen}
              title="Fit to screen"
            >
              <Maximize className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleReset}
              title="Reset view"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {zoom > 100 && (
            <>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Move className="h-3 w-3" />
                <span>Drag to pan</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Image Container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden bg-[#1a1a1a] flex items-center justify-center p-6"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: zoom > 100 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          onLoad={handleImageLoad}
          className="max-w-none transition-transform duration-100 select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom / 100}) rotate(${rotation}deg)`,
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
            borderRadius: '4px',
          }}
          draggable={false}
        />
      </div>

      {/* Info Footer */}
      {imageSize.width > 0 && (
        <div className="shrink-0 px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
          {imageSize.width} × {imageSize.height} pixels
          {rotation !== 0 && <span> • Rotated {rotation}°</span>}
        </div>
      )}
    </div>
  );
}

export default ImageViewer;
