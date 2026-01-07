import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader } from '@/components/ui/loader';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import type { ShowcaseMedia } from '@/types/showcase';
import { RefreshCw } from 'lucide-react';

interface ShowcaseStageMediaProps {
  media: ShowcaseMedia;
}

/**
 * ShowcaseStageMedia - Renders media (images or videos) for showcase stages
 *
 * Handles different media types with appropriate loading states:
 * - Videos: Shows loading spinner, autoplay once, and thin progress bar
 *   displaying both buffered (light) and played (primary) progress
 * - Images: Shows loading skeleton until image loads
 *
 * Uses fixed aspect ratio (16:10) to prevent layout shift during loading.
 *
 * @param media - ShowcaseMedia object with type ('image' or 'video') and src URL
 */
export function ShowcaseStageMedia({ media }: ShowcaseStageMediaProps) {
  const { t } = useTranslation('common');
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isLoading, playedPercent, bufferedPercent } =
    useVideoProgress(videoRef);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);

  if (media.type === 'video') {
    const handleReplay = () => {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
        setVideoEnded(false);
      }
    };

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
          muted
          playsInline
          onEnded={() => setVideoEnded(true)}
          className="w-full h-full object-contain"
        />
        {videoEnded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={handleReplay}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <RefreshCw size={20} />
              {t('buttons.replay')}
            </button>
          </div>
        )}
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
