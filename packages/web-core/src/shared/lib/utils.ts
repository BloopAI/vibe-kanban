import { type ClassValue, clsx } from 'clsx';
// import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  // TODO: Re-enable twMerge after migration to tailwind v4
  // Doesn't support de-duplicating custom classes, eg text-brand and text-base
  // return twMerge(clsx(inputs));
  return clsx(inputs);
}

/**
 * Play a sound file.  In the Tauri desktop app we use AudioContext (Web
 * Audio API) because `new Audio()` registers with macOS NowPlaying /
 * MediaRemote, triggering an "access Apple Music" TCC prompt.  In the
 * browser the standard HTMLAudioElement works fine.
 */
export async function playSound(url: string): Promise<void> {
  if ('__TAURI_INTERNALS__' in window) {
    const ctx = new AudioContext();
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const audio = await ctx.decodeAudioData(buf);
      const src = ctx.createBufferSource();
      src.buffer = audio;
      src.connect(ctx.destination);
      src.start();
      await new Promise<void>((resolve) => {
        src.onended = () => resolve();
      });
    } finally {
      await ctx.close();
    }
  } else {
    const audio = new Audio(url);
    await audio.play();
  }
}

export function formatFileSize(bytes: bigint | null | undefined): string {
  if (!bytes) return '';
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}
