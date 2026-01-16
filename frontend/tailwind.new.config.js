/** @type {import('tailwindcss').Config} */

const sizes = {
  '2xs': 0.5,
  xs: 0.75,
  sm: 0.875,
  base: 1,
  lg: 1.125,
  xl: 1.25,
}

const lineHeightMultiplier = 1.6;
const radiusMultiplier = 0.75; // Larger radius for softer, rounder appearance
const iconMultiplier = 1.25;
const chatMaxWidth = '48rem';

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
    extend: {
      height: {
        'cta': '29px',
      },
      width: {
        chat: chatMaxWidth,
      },
      containers: {
        chat: chatMaxWidth,
      },
      size: {
        'icon-2xs': getSize('2xs', iconMultiplier),
        'icon-xs': getSize('xs', iconMultiplier),
        'icon-sm': getSize('sm', iconMultiplier),
        'icon-base': getSize('base', iconMultiplier),
        'icon-lg': getSize('lg', iconMultiplier),
        'icon-xl': getSize('xl', iconMultiplier),
        'dot': '0.3rem', // 6px - for animated indicator dots
      },
      backgroundImage: {
        'diagonal-lines': `
          repeating-linear-gradient(-45deg, hsl(var(--text-low) / 0.4) 0 2px, transparent 1px 12px),
          linear-gradient(hsl(var(--bg-primary)), hsl(var(--bg-primary)))
        `,
        // Soft gradient backgrounds
        'soft-gradient': 'linear-gradient(135deg, hsl(var(--bg-primary)) 0%, hsl(var(--bg-secondary)) 100%)',
        'brand-gradient': 'linear-gradient(135deg, hsl(var(--brand)) 0%, hsl(var(--brand-hover)) 100%)',
      },
      boxShadow: {
        // Soft, modern shadows
        'soft-sm': '0 2px 8px -2px hsl(var(--text-low) / 0.1)',
        'soft': '0 4px 16px -4px hsl(var(--text-low) / 0.12)',
        'soft-md': '0 8px 24px -6px hsl(var(--text-low) / 0.15)',
        'soft-lg': '0 12px 32px -8px hsl(var(--text-low) / 0.18)',
        'soft-xl': '0 20px 48px -12px hsl(var(--text-low) / 0.22)',
        // Card shadows with subtle border effect
        'card': '0 1px 3px hsl(var(--text-low) / 0.08), 0 0 0 1px hsl(var(--border) / 0.5)',
        'card-hover': '0 4px 12px hsl(var(--text-low) / 0.12), 0 0 0 1px hsl(var(--border))',
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
        cta: [getSize('base'), { lineHeight: getSize('base') }],         // 16px
      },
      spacing: {
        'half': getSize('base', 0.25),
        'base': getSize('base', 0.5),
        'plusfifty': getSize('base', 0.75),
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
        'brand-hover': "hsl(var(--brand-hover))",
        'brand-secondary': "hsl(var(--brand-secondary))",
        error: "hsl(var(--error))",
        success: "hsl(var(--success))",
        // Text on accent
        'on-brand': "hsl(var(--text-on-brand))",
        // shadcn-style colors (used by @apply in CSS base layer)
        background: "hsl(var(--bg-primary))",
        foreground: "hsl(var(--text-normal))",
        border: "hsl(var(--border))",
      },
      borderColor: {
        DEFAULT: "hsl(var(--border))",
        border: "hsl(var(--border))",
      },
      borderRadius: {
        'xl': '1rem',
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
        DEFAULT: '0.5rem',
      },
      borderWidth: {
        base: getSize('base'),
        half: getSize('base', 0.5),
      },
      fontFamily: {
        // Modern, rounded fonts - Japanese-friendly with soft appearance
        sans: ['Inter', '"Noto Sans JP"', '"Noto Emoji"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // Keep old aliases for backwards compatibility
        'ibm-plex-sans': ['Inter', '"Noto Sans JP"', '"Noto Emoji"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'ibm-plex-mono': ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
        'border-flash': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Smooth micro-interaction keyframes
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'scale-in-bounce': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '50%': { transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'blur-in': {
          '0%': { opacity: '0', filter: 'blur(4px)' },
          '100%': { opacity: '1', filter: 'blur(0)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'wiggle': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-2deg)' },
          '75%': { transform: 'rotate(2deg)' },
        },
        'pop': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        pill: 'pill 2s ease-in-out forwards',
        'running-dot-1': 'running-dot 1.4s ease-in-out infinite',
        'running-dot-2': 'running-dot 1.4s ease-in-out 0.2s infinite',
        'running-dot-3': 'running-dot 1.4s ease-in-out 0.4s infinite',
        'border-flash': 'border-flash 2s linear infinite',
        // Smooth micro-interactions
        'fade-in': 'fade-in 0.25s ease-out',
        'fade-in-up': 'fade-in-up 0.3s ease-out',
        'fade-in-down': 'fade-in-down 0.3s ease-out',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slide-down 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slide-in-left 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 0.2s ease-out',
        'scale-in-bounce': 'scale-in-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'blur-in': 'blur-in 0.3s ease-out',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'wiggle': 'wiggle 0.5s ease-in-out',
        'pop': 'pop 0.2s ease-out',
      },
      transitionTimingFunction: {
        // Smooth, natural easing curves
        'ease-soft': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'ease-in-out-back': 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/container-queries"), require("tailwind-scrollbar")({ nocompatible: true })],
}
