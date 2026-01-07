import { useEffect, useState, RefObject } from 'react';

interface VideoProgress {
  isLoading: boolean;
  playedPercent: number; // 0-100
  bufferedPercent: number; // 0-100
  duration: number; // in seconds
}

/**
 * Track video loading state and playback/buffering progress
 */
export function useVideoProgress(
  videoRef: RefObject<HTMLVideoElement>
): VideoProgress {
  const [isLoading, setIsLoading] = useState(true);
  const [playedPercent, setPlayedPercent] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Event handlers
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handleTimeUpdate = () => {
      if (video.duration) {
        setPlayedPercent((video.currentTime / video.duration) * 100);
      }
    };

    const handleProgress = () => {
      if (video.duration && video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        setBufferedPercent((bufferedEnd / video.duration) * 100);
      }
    };

    // Attach listeners
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
    };
  }, [videoRef]);

  return { isLoading, playedPercent, bufferedPercent, duration };
}
