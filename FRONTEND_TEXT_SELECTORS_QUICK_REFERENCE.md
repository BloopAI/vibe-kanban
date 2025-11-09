# Frontend Text Content - CSS Selectors Quick Reference

## Primary Content Area Selectors

### Chat Message Container (All messages)
```css
div.px-4.py-2.text-sm { }
```
- Applies to assistant, user, and system messages
- Base font size: 12px (text-sm)
- Padding: 16px (px-4) / 8px (py-2)

### Markdown Rendered Text (Most important)
```css
.whitespace-pre-wrap.break-words.flex.flex-col.gap-1.font-light { }
```
- Used in conversation entries, user messages, plan presentations
- Font weight: 300 (font-light) - body text
- Line wrapping enabled
- Current size: 12px

### Log Output / Terminal Text
```css
.font-mono.text-xs.break-all.whitespace-pre-wrap { }
```
- Raw command output
- Monospace font: Chivo Mono
- Current size: 10px (text-xs)
- ANSI color support via `.ansi-*` classes

### Diff/Code Viewer Content
```css
.diff-tailwindcss-wrapper .diff-line-content { }
.diff-line-syntax-raw { }
```
- Hardcoded font-size: 12px (in DiffView prop)
- Requires CSS override with !important or inline style
- Syntax highlighting applied via `.hljs` classes

---

## Secondary Content Selectors

### Headers in Markdown
```css
h1 { /* text-lg = 16px */ }
h2 { /* text-base = 14px */ }
h3 { /* text-sm = 12px */ }
```

### Code Blocks in Markdown
```css
pre { /* font-mono text-sm = 12px monospace */ }
code { /* font-mono text-sm = 12px monospace */ }
```

### Lists in Markdown
```css
ul li { /* leading-tight */ }
ol li { /* leading-tight */ }
```

### Plan Presentation Card
```css
div.border.w-full.rounded-sm /* container */
div[class*="px-3 py-2 text-sm"] /* content area */
```

---

## UI Control Selectors (DO NOT MODIFY)

### Button Components
```css
button[class*="inline-flex items-center justify-center"]
button[class*="text-sm font-medium"]
[role="button"][class*="whitespace-nowrap"]
```

### Form Labels
```css
label.text-sm
label.text-xs
div.text-sm.font-bold
```

### Dialog/Modal Text
```css
[role="dialog"] .text-sm
[role="dialog"] .text-xs
```

### Navigation/Tabs
```css
nav *
[role="tab"]
[role="tablist"]
```

---

## Font Size Mapping (Tailwind)

| Class | Size | Line Height | Use Case |
|-------|------|-------------|----------|
| `text-xs` | 10px | 14px | Logs, labels, secondary text |
| `text-sm` | 12px | 16px | Main body text, code blocks |
| `text-base` | 14px | 20px | Smaller headers |
| `text-lg` | 16px | 24px | Main headers |
| `text-xl` | 18px | 28px | Large headers |

---

## Font Family Classes

### Serif (not used)
```css
font-serif /* Not used in codebase */
```

### Monospace (Code)
```css
font-mono /* Chivo Mono - all code and logs */
```

### Default Font Weight
```css
font-light /* 300 - body text in conversations */
font-normal /* 400 - labels, headers */
font-medium /* 500 - emphasized text */
font-bold /* 700 - strong emphasis */
```

---

## Container/Wrapper Patterns

### Standard Message Wrapper
```html
<div class="px-4 py-2 text-sm">
  <div class="whitespace-pre-wrap break-words flex flex-col gap-1 font-light">
    {content}
  </div>
</div>
```

### Markdown Wrapper
```html
<div class="relative group"> <!-- copy button container -->
  <div class={className}>  <!-- flexible styling from parent -->
    <Markdown>{content}</Markdown>
  </div>
</div>
```

### Log/Terminal Output
```html
<div class="font-mono text-xs break-all whitespace-pre-wrap">
  <AnsiHtml>{content}</AnsiHtml>
</div>
```

### Diff Viewer
```html
<div class="my-4 border">
  <div class="flex items-center px-4 py-2">
    {/* header with file path and buttons */}
  </div>
  <div class="diff-tailwindcss-wrapper">
    <DiffView diffViewFontSize={12} /> {/* hardcoded 12px */}
  </div>
</div>
```

---

## CSS Custom Properties (Theme)

### Main Colors
```css
--foreground: 222.2 84% 4.9%
--background: 48 33% 97%
--muted-foreground: var(--foreground)
--card: var(--muted)
```

### Text Colors
```css
--destructive: 0 84.2% 60.2%
--success: 142.1 76.2% 36.3%
--console-foreground: 222.2 84% 4.9%
--console-success: 138 69% 45%
--console-error: 5 100% 69%
```

### Diff Colors
```css
--diff-add-content--: hsl(var(--console-success) / 0.2)
--diff-del-content--: hsl(var(--console-error) / 0.2)
--diff-plain-content--: hsl(var(--muted))
```

---

## ANSI Color Classes

```css
.ansi-red, .ansi-bright-red
.ansi-green, .ansi-bright-green
.ansi-yellow, .ansi-bright-yellow
.ansi-blue, .ansi-bright-blue
.ansi-magenta, .ansi-bright-magenta
.ansi-cyan, .ansi-bright-cyan
.ansi-black, .ansi-bright-black
.ansi-white, .ansi-bright-white
.ansi-bold, .ansi-italic, .ansi-underline
```

---

## Implementation Tips

### Option 1: CSS Variable Scale (Recommended)
```css
:root {
  --text-scale: 1.2; /* 1.2x scaling */
}

.text-xs { font-size: calc(0.625rem * var(--text-scale)); }
.text-sm { font-size: calc(0.75rem * var(--text-scale)); }
.text-base { font-size: calc(0.875rem * var(--text-scale)); }
.text-lg { font-size: calc(1rem * var(--text-scale)); }
```

### Option 2: Direct Class Overrides
```css
.whitespace-pre-wrap.break-words.font-light {
  font-size: 14px; /* from 12px */
}

.font-mono.text-xs.break-all {
  font-size: 12px; /* from 10px */
}

.diff-line-content {
  font-size: 14px !important; /* from 12px */
}
```

### Option 3: Wrapper Container
```css
.content-text-scaler {
  --text-scale: 1.15;
}

.content-text-scaler .text-sm { font-size: 13.8px; }
.content-text-scaler .text-xs { font-size: 11.5px; }
```

---

## File Locations

| File | Purpose |
|------|---------|
| `frontend/src/styles/index.css` | Theme variables, ANSI colors |
| `frontend/src/styles/diff-style-overrides.css` | Diff viewer CSS |
| `frontend/tailwind.config.js` | Font size definitions |
| `frontend/src/components/ui/markdown-renderer.tsx` | Markdown element styling |
| `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx` | Main conversation rendering |
| `frontend/src/components/common/RawLogText.tsx` | Log output rendering |
| `frontend/src/components/DiffCard.tsx` | Diff viewer component |

---

## Key Takeaways

1. **Main text uses Tailwind `text-sm` (12px)**
   - Target: `.whitespace-pre-wrap.break-words.font-light`
   - Affects: Assistant messages, user messages, system messages, tool output

2. **Logs use `text-xs` monospace (10px)**
   - Target: `.font-mono.text-xs.break-all`
   - Affects: Command output, process logs, terminal text

3. **Diffs hardcoded to 12px**
   - Target: `.diff-line-content` with CSS override
   - Requires: `!important` or inline style modification

4. **Markdown has custom sizing**
   - Headers: text-lg, text-base, text-sm
   - Code: text-sm monospace
   - Lists: default text-sm

5. **Never touch button/control styling**
   - Keep UI action text at current sizes
   - Only scale content areas

