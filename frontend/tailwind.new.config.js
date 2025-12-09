/** @type {import('tailwindcss').Config} */

const sizes = {
  xs: 0.75,
  sm: 0.875,
  base: 1,
  lg: 1.125,
  xl: 1.25,
}

const lineHeightMultiplier = 1.5;
const radiusMultiplier = 0.25;

function getSize(sizeLabel, multiplier = 1) {

  return sizes[sizeLabel] * multiplier + "rem";
}

module.exports = {
  darkMode: ["class"],
  important: '.new-design',
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    "node_modules/@rjsf/shadcn/src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  safelist: [
    'xl:hidden',
    'xl:relative',
    'xl:inset-auto',
    'xl:z-auto',
    'xl:h-full',
    'xl:w-[800px]',
    'xl:flex',
    'xl:flex-1',
    'xl:min-w-0',
    'xl:overflow-y-auto',
    'xl:opacity-100',
    'xl:pointer-events-auto',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    fontWeight: {
      thin: "100",
      normal: "500",
      semibold: "600",
    },
    extend: {
      size: {
        'icon-xs': getSize('xs'),
        'icon-sm': getSize('sm'),
        'icon-base': getSize('base'),
        'icon-lg': getSize('lg'),
        'icon-xl': getSize('xl'),
      },
      backgroundImage: {
        'diagonal-lines': `
          repeating-linear-gradient(-45deg, hsl(var(--text-low) / 0.4) 0 2px, transparent 1px 12px),
          linear-gradient(hsl(var(--bg-primary)), hsl(var(--bg-primary)))
        `,
      },
      ringColor: {
        DEFAULT: 'hsl(var(--brand))',
      },
      fontSize: {
        xs: [getSize('xs'), { lineHeight: getSize('xs', lineHeightMultiplier) }],      // 8px
        sm: [getSize('sm'), { lineHeight: getSize('sm', lineHeightMultiplier) }],   // 10px
        base: [getSize('base'), { lineHeight: getSize('base', lineHeightMultiplier) }],  // 12px (base)
        lg: [getSize('lg'), { lineHeight: getSize('lg', lineHeightMultiplier) }],    // 14px
        xl: [getSize('xl'), { lineHeight: getSize('xl', lineHeightMultiplier) }],         // 16px
      },
      spacing: {
        'half': getSize('base', 0.25),
        'base': getSize('base', 0.5),
        'double': getSize('base', 1),
      },
      colors: {
        // Text colors: text-high, text-normal, text-low
        high: "hsl(var(--text-high))",
        normal: "hsl(var(--text-normal))",
        low: "hsl(var(--text-low))",
        // Background colors: bg-primary, bg-secondary, bg-panel
        primary: "hsl(var(--bg-primary))",
        secondary: "hsl(var(--bg-secondary))",
        panel: "hsl(var(--bg-panel))",
        // Accent colors
        brand: "hsl(var(--brand))",
        error: "hsl(var(--error))",
        success: "hsl(var(--success))",
        // shadcn-style colors (used by @apply in CSS base layer)
        background: "hsl(var(--bg-primary))",
        foreground: "hsl(var(--text-high))",
        border: "hsl(var(--border))",
      },
      borderColor: {
        DEFAULT: "hsl(var(--border))",
        border: "hsl(var(--border))",
      },
      borderRadius: {
        lg: getSize('lg', radiusMultiplier),
        md: getSize('sm', radiusMultiplier),
        sm: getSize('xs', radiusMultiplier),
      },
      fontFamily: {
        'ibm-plex-sans': ['IBM Plex Sans', 'Noto Emoji', 'sans-serif'],
        'ibm-plex-mono': ['IBM Plex Mono', 'Noto Emoji', 'monospace'],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        pill: {
          '0%': { opacity: '0' },
          '10%': { opacity: '1' },
          '80%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'running-dot': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        pill: 'pill 2s ease-in-out forwards',
        'running-dot-1': 'running-dot 1.4s ease-in-out infinite',
        'running-dot-2': 'running-dot 1.4s ease-in-out 0.2s infinite',
        'running-dot-3': 'running-dot 1.4s ease-in-out 0.4s infinite',
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/container-queries")],
}
