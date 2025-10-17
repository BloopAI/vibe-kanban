import { useRef, useState } from 'react';
import { Loader } from '@/components/ui/loader';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import type { ShowcaseMedia } from '@/types/showcase';

interface ShowcaseStageMediaProps {
  media: ShowcaseMedia;
}

/**
 * ShowcaseStageMedia - Renders media (images or videos) for showcase stages
 * 
 * Handles different media types with appropriate loading states:
 * - Videos: Shows loading spinner, autoplay with loop, and thin progress bar
 *   displaying both buffered (light) and played (primary) progress
 * - Images: Shows loading skeleton until image loads
 * 
 * Uses fixed aspect ratio (16:10) to prevent layout shift during loading.
 * 
 * @param media - ShowcaseMedia object with type ('image' or 'video') and src URL
 */
export function ShowcaseStageMedia({ media }: ShowcaseStageMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isLoading, playedPercent, bufferedPercent } =
    useVideoProgress(videoRef);
  const [imageLoaded, setImageLoaded] = useState(false);

  if (media.type === 'video') {
    return (
      <div className="relative w-full aspect-[16/10] bg-black">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader size={32} />
          </div>
        )}
        <video
          ref={videoRef}
          src={media.src}
          poster={media.poster}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-contain"
        />
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-transparent">
          <div
            className="h-1 bg-muted-foreground/30 transition-all"
            style={{ width: `${bufferedPercent}%` }}
          />
          <div
            className="absolute top-0 left-0 h-1 bg-primary transition-all"
            style={{ width: `${playedPercent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[16/10] bg-muted">
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader size={32} />
        </div>
      )}
      <img
        src={media.src}
        alt={media.alt || ''}
        onLoad={() => setImageLoaded(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
}
