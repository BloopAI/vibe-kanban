## New Design System Styling Guidelines

### Design Philosophy

The design system emphasizes a **soft, modern, Japanese-friendly** aesthetic with:
- Rounded corners for a gentle, approachable feel
- Soft colors with blue undertones
- Inter + Noto Sans JP fonts for excellent Japanese text rendering
- Smooth micro-interactions and transitions

### CSS Variables & Tailwind Config

The new design uses custom CSS variables defined in `src/styles/new/index.css` and configured in `tailwind.new.config.js`. All styles are scoped to the `.new-design` class.

### Colors

**Text colors** (use these instead of `text-gray-*`):
- `text-high` - Primary text, highest contrast
- `text-normal` - Standard text
- `text-low` - Muted/secondary text, placeholders

**Background colors** (soft blue-gray tints):
- `bg-primary` - Main background (very light blue-white)
- `bg-secondary` - Cards, inputs, sidebars
- `bg-panel` - Elevated surfaces, modals

**Accent colors** (friendly blue theme):
- `brand` - Primary blue accent (`hsl(213 94% 55%)`)
- `brand-hover` - Lighter blue for hover states
- `error` - Soft red for error states
- `success` - Soft green for success states

### Typography

**Font families**:
- `font-sans` - Inter + Noto Sans JP (default, Japanese-friendly)
- `font-mono` - JetBrains Mono (code)

**Font sizes** (with comfortable line-height 1.6):
- `text-xs` - 12px
- `text-sm` - 14px
- `text-base` - 16px (default)
- `text-lg` - 18px
- `text-xl` - 20px

### Spacing

Custom spacing tokens:
- `p-half` / `m-half` - 4px
- `p-base` / `m-base` - 8px
- `p-double` / `m-double` - 16px

### Border Radius

Uses soft, rounded corners by default (`--radius: 0.75rem`):
- `rounded-sm` - 6px (subtle rounding)
- `rounded` or `rounded-md` - 8px (default)
- `rounded-lg` - 12px (prominent rounding)
- `rounded-xl` - 16px (very rounded, for cards/modals)

### Shadows

Soft shadow utilities for depth:
- `shadow-soft-sm` - Subtle elevation
- `shadow-soft` - Default card shadow
- `shadow-soft-md` - Modal/dropdown shadow
- `shadow-card` - Card with subtle border effect
- `shadow-card-hover` - Interactive card hover state

### Focus States

Focus rings use `ring-brand` (blue) and are inset by default.

### Transitions

Smooth easing functions:
- `ease-soft` - Natural, smooth transitions
- `ease-bounce` - Playful micro-interactions

### Example Component Styling

```tsx
// Modern card with soft shadow
className="bg-primary rounded-lg shadow-card p-4 hover:shadow-card-hover transition-shadow"

// Soft input field
className="px-4 py-2 bg-secondary rounded-lg border text-base text-normal placeholder:text-low focus:outline-none focus:ring-2 focus:ring-brand/50"

// Primary button (blue gradient)
className="px-4 py-2 bg-brand hover:bg-brand-hover text-on-brand rounded-lg font-medium transition-colors"

// Sidebar container
className="w-64 bg-secondary shrink-0 p-4 rounded-xl"

// Animated list item
className="animate-slide-up hover:bg-secondary/50 transition-colors rounded-lg p-3"
```

### Architecture Rules

- **View components** (in `views/`) should be stateless - receive all data via props
- **Container components** (in `containers/`) manage state and pass to views
- **UI components** (in `ui-new/`) are reusable primitives
- File names in `ui-new/` must be **PascalCase** (e.g., `Field.tsx`, `Label.tsx`)