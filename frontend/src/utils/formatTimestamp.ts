// formatea timestamp RFC3339 a formato relativo o absoluto
export function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return '';

  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    // formato relativo para timestamps recientes
    if (diffSeconds < 10) return 'now';
    if (diffSeconds < 60) return `${diffSeconds}s`;
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    // formato absoluto para timestamps antiguos
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    // si es del mismo año, no mostrar año
    if (date.getFullYear() === now.getFullYear()) {
      return `${month}/${day} ${hours}:${minutes}`;
    }

    return `${month}/${day}/${date.getFullYear()} ${hours}:${minutes}`;
  } catch (e) {
    return '';
  }
}

// formatea timestamp para usar en el atributo 'title' (tooltip) con formato legible completo
export function formatFullTimestamp(timestamp: string | null): string {
  if (!timestamp) return '';

  try {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return '';
  }
}
