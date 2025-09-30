import type { ImageResponse } from 'shared/types';

export function imageToMarkdown(image: ImageResponse): string {
  return `![${image.original_name}](${image.file_path})`;
}

export function appendImageMarkdown(
  prev: string,
  image: ImageResponse
): string {
  const markdownText = imageToMarkdown(image);
  if (prev.trim() === '') return markdownText + '\n';
  const needsNewline = !prev.endsWith('\n');
  return prev + (needsNewline ? '\n' : '') + markdownText + '\n';
}
