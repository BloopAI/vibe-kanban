const ZOOM_STORAGE_KEY = 'vk-zoom-level';
const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const STEP = 1;

function loadFontSize(): number {
  try {
    const stored = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (stored) {
      const size = Number(stored);
      if (size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE) return size;
    }
  } catch {
    // localStorage may be unavailable
  }
  return DEFAULT_FONT_SIZE;
}

function saveFontSize(size: number): void {
  try {
    if (size === DEFAULT_FONT_SIZE) {
      localStorage.removeItem(ZOOM_STORAGE_KEY);
    } else {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(size));
    }
  } catch {
    // localStorage may be unavailable
  }
}

function applyFontSize(size: number): void {
  document.documentElement.style.fontSize = `${size}px`;
}

let currentFontSize = DEFAULT_FONT_SIZE;

export function zoomIn(): void {
  currentFontSize = Math.min(currentFontSize + STEP, MAX_FONT_SIZE);
  applyFontSize(currentFontSize);
  saveFontSize(currentFontSize);
}

export function zoomOut(): void {
  currentFontSize = Math.max(currentFontSize - STEP, MIN_FONT_SIZE);
  applyFontSize(currentFontSize);
  saveFontSize(currentFontSize);
}

export function zoomReset(): void {
  currentFontSize = DEFAULT_FONT_SIZE;
  applyFontSize(currentFontSize);
  saveFontSize(currentFontSize);
}

export function initZoom(): void {
  currentFontSize = loadFontSize();
  if (currentFontSize !== DEFAULT_FONT_SIZE) {
    applyFontSize(currentFontSize);
  }
}
