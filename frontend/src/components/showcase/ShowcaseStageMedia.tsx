import { useRef, useState } from 'react';
import { Loader } from '@/components/ui/loader';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import type { ShowcaseMedia } from '@/types/showcase';

interface ShowcaseStageMediaProps {
  media: ShowcaseMedia;
}

export function ShowcaseStageMedia({ media }: ShowcaseStageMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isLoading, playedPercent, bufferedPercent } = useVideoProgress(videoRef);
  const [imageLoaded, setImageLoaded] = useState(false);

  if (media.type === 'video') {
    return (
      <div className="relative w-full aspect-video bg-black">
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
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-transparent">
          <div
            className="h-full bg-muted-foreground/30 transition-all"
            style={{ width: `${bufferedPercent}%` }}
          />
          <div
            className="absolute top-0 left-0 h-full bg-primary transition-all"
            style={{ width: `${playedPercent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-muted">
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
