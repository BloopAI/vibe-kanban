import { useMemo } from 'react';

export interface GoogleFont {
  family: string;
  category: string;
}

// Curated list of popular Google Fonts
// No API key needed - we'll load these directly from Google Fonts CDN
const CURATED_FONTS: GoogleFont[] = [
  { family: 'Chivo Mono', category: 'monospace' },
  { family: 'Inter', category: 'sans-serif' },
  { family: 'Roboto', category: 'sans-serif' },
  { family: 'Open Sans', category: 'sans-serif' },
  { family: 'Lato', category: 'sans-serif' },
  { family: 'Montserrat', category: 'sans-serif' },
  { family: 'Poppins', category: 'sans-serif' },
  { family: 'Raleway', category: 'sans-serif' },
  { family: 'Ubuntu', category: 'sans-serif' },
  { family: 'Nunito', category: 'sans-serif' },
  { family: 'Playfair Display', category: 'serif' },
  { family: 'Merriweather', category: 'serif' },
  { family: 'Source Sans Pro', category: 'sans-serif' },
  { family: 'PT Sans', category: 'sans-serif' },
  { family: 'Noto Sans', category: 'sans-serif' },
  { family: 'Work Sans', category: 'sans-serif' },
  { family: 'Oswald', category: 'sans-serif' },
  { family: 'Roboto Condensed', category: 'sans-serif' },
  { family: 'Fira Sans', category: 'sans-serif' },
  { family: 'Titillium Web', category: 'sans-serif' },
  { family: 'Karla', category: 'sans-serif' },
];

export function useGoogleFonts() {
  const fonts = useMemo(() => CURATED_FONTS, []);

  return { fonts, loading: false, error: null };
}

export function loadGoogleFont(fontFamily: string) {
  const existingLink = document.querySelector(
    `link[href*="fonts.googleapis.com"][href*="${fontFamily.replace(
      / /g,
      '+'
    )}"]`
  );

  if (!existingLink) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(
      / /g,
      '+'
    )}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }
}
