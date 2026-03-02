import { type ClassValue, clsx } from 'clsx';
// import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  // TODO: Re-enable twMerge after migration to tailwind v4
  // Doesn't support de-duplicating custom classes, eg text-brand and text-base
  // return twMerge(clsx(inputs));
  return clsx(inputs);
}

/**
 * Play a sound file using the Web Audio API (AudioContext) instead of
 * HTMLAudioElement.  `new Audio()` registers with macOS NowPlaying /
 * MediaRemote, which causes an "access Apple Music" TCC prompt in the
 * Tauri desktop app.  AudioContext bypasses that integration entirely.
 */
export async function playSound(url: string): Promise<void> {
  const ctx = new AudioContext();
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);
    const src = ctx.createBufferSource();
    src.buffer = audio;
    src.connect(ctx.destination);
    src.start();
    // Let the sound finish, then close the context to free resources.
    await new Promise<void>((resolve) => {
      src.onended = () => resolve();
    });
  } finally {
    await ctx.close();
  }
}

export function formatFileSize(bytes: bigint | null | undefined): string {
  if (!bytes) return '';
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}
