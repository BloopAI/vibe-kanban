# Frontend Text Content Areas - CSS Classes & Component Structure

## Overview
This document maps out the main text content areas in Vibe Kanban's frontend, their CSS classes, component structure, and styling approaches. This enables targeted CSS selectors for boosting font sizes in content areas without affecting UI controls.

---

## 1. Chat/Conversation Components

### Main Conversation Container
- **Component**: `DisplayConversationEntry` (DisplayConversationEntryMaxWidth wrapper)
- **Location**: `/frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`
- **Max Width Container**: `max-w-[50rem]` (Tailwind class)
- **Content Wrapper**: `px-4 py-2 text-sm` (standard padding and text size)

### Conversation Entry Types & Styling

#### Assistant Messages
- **Component**: `DisplayConversationEntry` with `entry_type.type === 'assistant_message'`
- **Markdown Renderer**: `MarkdownRenderer` component
- **Key Classes**:
  - Container: `px-4 py-2 text-sm`
  - Content: `whitespace-pre-wrap break-words flex flex-col gap-1 font-light`
  - Markdown wrapper applies these internally

#### User Messages
- **Component**: `UserMessage`
- **Location**: `/frontend/src/components/NormalizedConversation/UserMessage.tsx`
- **Container**: `bg-background px-4 py-2 text-sm flex gap-2`
- **Content**: `py-3` (inside flex-1 wrapper)
- **Rendering**: MarkdownRenderer with `whitespace-pre-wrap break-words flex flex-col gap-1 font-light`
- **Edit Button**: Ghost variant button that appears on hover (does not affect main text)

#### System Messages
- **Component**: `DisplayConversationEntry` with `entry_type.type === 'system_message'`
- **Card Component**: `MessageCard` with variant='system'
- **Container Classes**: `border px-3 py-2 w-full bg-[hsl(var(--card))] border-[hsl(var(--border))]`
- **Content Classes**: `whitespace-pre-wrap break-words` (base)
- **Collapsible**: `CollapsibleEntry` component manages expansion

#### Error Messages
- **Component**: `DisplayConversationEntry` with `entry_type.type === 'error_message'`
- **Card Component**: `MessageCard` with variant='error'
- **Content Classes**: `whitespace-pre-wrap break-words font-mono text-destructive`
- **Background**: `bg-red-50 dark:bg-[hsl(var(--card))]`

#### Tool Use / Command Output
- **Component**: `ToolCallCard` for generic tool calls
- **Location**: `/frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`
- **Header**: `flex items-center gap-1.5 text-left text-secondary-foreground`
- **Details Section**: `max-h-[200px] overflow-y-auto border`
  - Args label: `font-normal uppercase bg-background border-dashed px-2 py-1`
  - Output label: `font-normal uppercase bg-background border-y border-dashed px-2 py-1`
  - Content: `px-2 py-1`
- **Command Output**: Uses `RawLogText` component (see below)

#### Thinking/Reasoning
- **Component**: `DisplayConversationEntry` with `entry_type.type === 'thinking'`
- **Content Classes**: `whitespace-pre-wrap break-words opacity-60`
- **Markdown supported**

#### Plan Presentation
- **Component**: `PlanPresentationCard`
- **Container**: `border w-full overflow-hidden rounded-sm` with colored borders
- **Header Button**: `w-full px-2 py-1.5 flex items-center gap-1.5 text-left border-b`
- **Content Area**: `px-3 py-2 text-sm`
- **Color Scheme**: 
  - Default: Blue theme (`border-blue-400/40`)
  - Denied: Red theme (`border-red-400/40`)
  - Timed Out: Amber theme (`border-amber-400/40`)
- **Content Renderer**: `MarkdownRenderer` with `whitespace-pre-wrap break-words`

#### User Feedback (Denied Tool)
- **Component**: Rendered in `DisplayConversationEntry`
- **Container**: `bg-background px-4 py-2 text-sm border-y border-dashed`
- **Label**: `text-xs mb-1 opacity-70` with destructive color
- **Content**: `MarkdownRenderer` with `whitespace-pre-wrap break-words flex flex-col gap-1 font-light py-3`

#### File Changes & Edits
- **Component**: `FileChangeRenderer` or `EditDiffRenderer`
- **Header**: `flex items-center gap-1.5 text-secondary-foreground`
- **Title**: `text-sm font-light overflow-x-auto flex-1` (clickable for expand)
- **Diff Viewer**: Uses `DiffView` from `@git-diff-view/react`
- **Diff Font Size**: `diffViewFontSize={12}` (hardcoded 12px)

---

## 2. Code Editor / Diff Components

### Diff Viewer Container
- **Component**: `DiffCard`
- **Location**: `/frontend/src/components/DiffCard.tsx`
- **Outer Container**: `my-4 border`
- **Header Row**: `flex items-center px-4 py-2`
- **Title**: `text-xs font-mono overflow-x-auto flex-1` (muted-foreground / 0.7)
- **File Path**: Shows old/new names with arrow if renamed

### Diff View Styling
- **Library**: `@git-diff-view/react` (DiffView component)
- **Font Size**: `diffViewFontSize={12}` (hardcoded in DiffCard)
- **CSS Classes Applied**: 
  - Wrapper: `.diff-tailwindcss-wrapper` (CSS-in-JS from library)
  - Root: `.diff-style-root` with CSS custom properties
  - Line syntax: `.diff-line-syntax-raw` for syntax highlighting
  - Line numbers: `.diff-line-old-num`, `.diff-line-new-num`
  - Content: `.diff-line-old-content`, `.diff-line-new-content`

### CSS Custom Properties for Diff (in diff-style-overrides.css)
```css
--diff-border--: var(--border)
--diff-add-content--: hsl(var(--console-success) / 0.2)
--diff-del-content--: hsl(var(--console-error) / 0.2)
--diff-add-lineNumber--: color-mix(...)
--diff-del-lineNumber--: hsl(var(--console-error) / 0.2)
--diff-plain-content--: hsl(var(--muted))
--diff-plain-lineNumber--: hsl(var(--muted))
--diff-plain-lineNumber-color--: hsl(var(--muted-foreground) / 0.7)
--diff-hunk-content--: hsl(var(--muted))
--diff-add-content-highlight--: hsl(var(--console-success) / 0.4)
--diff-del-content-highlight--: hsl(var(--console-error) / 0.4)
```

### Edit Diff Renderer
- **Component**: `EditDiffRenderer`
- **Location**: `/frontend/src/components/NormalizedConversation/EditDiffRenderer.tsx`
- **Container**: `mt-2 border` + hide-line-numbers class if needed
- **Header**: `flex items-center gap-1.5 text-secondary-foreground`
- **Title**: `text-sm font-mono overflow-x-auto flex-1`
- **Diff View**: `DiffModeEnum.Unified` mode
- **Font Size**: `diffViewFontSize={12}`
- **Line Numbers Hidden**: `.edit-diff-hide-nums` class hides line number gutters

### File Content View
- **Component**: `FileContentView`
- **Use Case**: New file creation preview
- **Syntax Highlighting**: Using language detection from file extension
- **Theme**: Dynamic theme based on user config

---

## 3. Log/Process Output Components

### Raw Log Text
- **Component**: `RawLogText`
- **Location**: `/frontend/src/components/common/RawLogText.tsx`
- **Container Classes**: `font-mono text-xs break-all whitespace-pre-wrap`
- **ANSI Support**: Uses `AnsiHtml` from `fancy-ansi/react`
- **Color Handling**: 
  - ANSI codes control colors when present
  - Fallback to `text-destructive` for stderr without ANSI codes
- **Flex Container**: Optional custom classes via props

### ANSI Color Classes (from index.css)
```css
.ansi-red, .ansi-bright-red
.ansi-green, .ansi-bright-green
.ansi-yellow, .ansi-bright-yellow
.ansi-blue, .ansi-bright-blue
.ansi-magenta, .ansi-bright-magenta (.ansi-purple-*)
.ansi-cyan, .ansi-bright-cyan
.ansi-white, .ansi-white-bright
.ansi-black, .ansi-bright-black
.ansi-bold, .ansi-italic, .ansi-underline
```

### Process Logs in Task Panel
- **Container**: `TaskAttemptPanel` -> `VirtualizedList`
- **Virtualization**: `VirtuosoMessageList` for performance
- **Item Content**: `DisplayConversationEntry` (renders normalized entries)
- **STDOUT/STDERR**: Display via `RawLogText` component

---

## 4. Markdown Renderer

### Component: MarkdownRenderer
- **Location**: `/frontend/src/components/ui/markdown-renderer.tsx`
- **Library**: `markdown-to-jsx`
- **Container**: `relative group` wrapper
- **Content Div**: Custom `className` prop for styling

### Custom Element Overrides

#### Paragraph
```typescript
className="leading-tight my-2"
```

#### Headers
- **h1**: `text-lg font-medium leading-tight mt-4 mb-2`
- **h2**: `text-base font-medium leading-tight mt-4 mb-2`
- **h3**: `text-sm leading-tight mt-3 mb-2`

#### Lists
- **ul**: `list-disc list-outside ps-6 my-3 space-y-1.5`
- **ol**: `list-decimal list-outside ps-6 my-3 space-y-1.5`
- **li**: `leading-tight`

#### Code
- **Inline code**: `rounded-sm bg-muted/50 px-1 py-0.5 font-mono text-sm`
- **Pre blocks**: `overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm bg-muted/50 rounded-sm p-2 my-2`

#### Links
- **Disabled internal links**: `rounded-sm bg-muted/50 px-1 py-0.5 cursor-not-allowed select-text`
- **External links**: Above + `hover:bg-muted underline`

### Copy Button (when enabled)
- **Sticky Position**: `sticky top-2 right-2 z-10 pointer-events-none`
- **Button Classes**: `h-8 w-8 rounded-md bg-background/95 backdrop-blur border shadow-sm`
- **Visibility**: `opacity-0 group-hover:opacity-100` with `delay-0 transition-opacity duration-50`

---

## 5. Button & UI Control Components

### Button Component (NOT content text)
- **Location**: `/frontend/src/components/ui/button.tsx`
- **Base Classes**: `inline-flex items-center justify-center whitespace-nowrap text-sm font-medium`
- **Variants**: default, destructive, outline, secondary, ghost, link, icon
- **Sizes**: default (h-10 px-4), xs (h-8 px-2), sm (h-9 px-3), lg (h-11 px-8), icon (h-10 w-10)
- **Focus Ring**: `focus-visible:ring-1 focus-visible:ring-ring/40`
- **Disabled**: `disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed`

### Diff Action Buttons
- **Expand/Collapse**: `variant="ghost" size="sm" h-6 w-6 p-0`
- **Open in IDE**: `variant="ghost" size="sm" h-6 w-6 p-0`
- **Comment Widget**: `h-6 w-6 p-0`

---

## 6. Text Sizing Reference (Tailwind Config)

From `tailwind.config.js`:
```javascript
fontSize: {
  xs: ['0.625rem', { lineHeight: '0.875rem' }],   // 10px / 14px
  sm: ['0.75rem', { lineHeight: '1rem' }],        // 12px / 16px
  base: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px / 20px
  lg: ['1rem', { lineHeight: '1.5rem' }],         // 16px / 24px
  xl: ['1.125rem', { lineHeight: '1.75rem' }],    // 18px / 28px
}
```

**Current Usage Pattern**:
- Main content: `text-sm` (12px) - MOST COMMON
- Labels/secondary: `text-xs` (10px)
- Headers: `text-lg` (16px)
- Smaller headers: `text-base` (14px)
- Mono/code: `text-sm` or `text-xs`

---

## 7. CSS Selectors for Targeted Font Scaling

### High-Priority Content Areas (Main text boost targets)

#### Chat/Conversation Messages
```css
/* Assistant messages */
.whitespace-pre-wrap.break-words.flex.flex-col.gap-1.font-light { ... }

/* User messages */
div.bg-background.px-4.py-2.text-sm .whitespace-pre-wrap { ... }

/* System/Error messages */
div[class*="border-400/40"] .whitespace-pre-wrap { ... }
```

#### Markdown Content
```css
/* Paragraph elements in markdown */
div:has(> p) p { ... }

/* Markdown headers */
h1, h2, h3 { ... }

/* Code blocks in markdown */
pre code, pre { ... }
```

#### Diff/Code Viewer
```css
/* Diff view text (font-size: 12px hardcoded in DiffView) */
.diff-tailwindcss-wrapper .diff-line-content { ... }
.diff-line-syntax-raw { ... }

/* Edit diff lines */
.edit-diff-hide-nums .diff-line-content { ... }
```

#### Log Output
```css
/* Raw log text */
.font-mono.text-xs.break-all.whitespace-pre-wrap { ... }

/* With ANSI colors */
.font-mono.text-xs [class*="ansi-"] { ... }
```

---

## 8. Component Hierarchy for Text Content

```
DisplayConversationEntry (px-4 py-2 text-sm)
├── MarkdownRenderer (content wrapper)
│   └── Markdown elements (p, h1-h3, ul, ol, pre, code)
│
├── UserMessage (bg-background px-4 py-2 text-sm)
│   └── MarkdownRenderer
│       └── Markdown elements
│
├── ToolCallCard (inline-block w-full flex flex-col)
│   ├── Header (text-secondary-foreground)
│   └── Details (max-h-[200px] overflow-y-auto border)
│       └── RawLogText (font-mono text-xs)
│
├── FileChangeRenderer (text-secondary-foreground)
│   └── EditDiffRenderer
│       └── DiffView (diffViewFontSize={12})
│
├── MessageCard (border px-3 py-2)
│   └── CollapsibleEntry
│       └── MarkdownRenderer or Raw Content
│
└── PlanPresentationCard (border w-full)
    └── Content (px-3 py-2 text-sm)
        └── MarkdownRenderer
```

---

## 9. Key Patterns for Text Content Targeting

### What IS Content Text (Target for boosting)
- Chat messages from assistant, user, system
- Error messages and logs
- Markdown-rendered content (headers, paragraphs, lists)
- Code diffs and file previews
- Process output and logs
- Tool execution results
- Plan presentations
- File operation descriptions

### What is NOT Content Text (Avoid boosting)
- Button labels and action text
- Form field labels
- Dialog titles and descriptions (non-content)
- Tab names
- Navigation items
- Status badges and labels
- Icon labels
- Confirmation dialogs
- Settings UI text

### Safe Selectors

**Target main content without affecting controls:**

```css
/* Conversation entries - main text area */
[class*="DisplayConversationEntry"] .whitespace-pre-wrap,
div[class*="px-4 py-2 text-sm"] .whitespace-pre-wrap {
  font-size: scale-up;
}

/* Markdown content specifically */
.relative.group [class*="className"] p,
.relative.group [class*="className"] h1,
.relative.group [class*="className"] h2,
.relative.group [class*="className"] h3 {
  font-size: scale-up;
}

/* Log output */
.font-mono.text-xs.break-all.whitespace-pre-wrap {
  font-size: scale-up;
}

/* Diff viewer text - careful, font-size hardcoded to 12px */
.diff-tailwindcss-wrapper .diff-line-content {
  font-size: scale-up !important;
}

/* NOT targets - buttons */
button[class*="buttonVariants"],
[role="button"][class*="inline-flex items-center justify-center"] {
  /* Do not modify */
}
```

---

## 10. Technical Implementation Notes

### Font Scaling Approach Options

1. **Root-level CSS Variable Scaling** (Recommended)
   - Set base font-size scale at `:root` level
   - All relative units inherit proportionally
   - Minimal CSS changes needed

2. **Tailwind Text-Size Overrides**
   - Create custom Tailwind text size utilities
   - Override specific classes like `.text-sm` for content areas
   - Context-aware: only within content containers

3. **Specific Component Selectors**
   - Target markdown renderer wrapper
   - Target raw log text container
   - Target diff view container
   - More surgical, more maintenance

### Performance Considerations
- Diff viewer uses hardcoded `diffViewFontSize={12}`
- Override requires inline style modification or CSS !important
- Log virtualization (VirtuosoMessageList) unaffected by font size
- Markdown rendering is client-side, font-size changes apply instantly

### Browser Compatibility
- All Tailwind utilities are standard CSS
- CSS custom properties widely supported
- No dependency on newer CSS features

---

## 11. File References

Key files for implementation:
- `/frontend/src/styles/index.css` - Theme tokens and base styles
- `/frontend/src/styles/diff-style-overrides.css` - Diff viewer CSS
- `/frontend/src/components/ui/markdown-renderer.tsx` - Markdown styling
- `/frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx` - Main conversation logic
- `/frontend/tailwind.config.js` - Font size definitions
- `/frontend/src/components/common/RawLogText.tsx` - Log output rendering

---

## Summary

The frontend uses a consistent pattern:
- **Container base**: `px-4 py-2 text-sm` for most content
- **Typography**: `font-light` for body text, `font-mono` for code
- **Markdown**: Custom overrides for all elements
- **Diffs**: Hardcoded 12px font-size in DiffView component
- **Logs**: 10px (text-xs) with monospace font

To boost text readability:
1. Target `.whitespace-pre-wrap` + `.font-light` for main content
2. Scale all Tailwind text classes proportionally
3. Force override diff viewer font-size with CSS or JavaScript
4. Leave button and control styling untouched
5. Test with markdown rendering and ANSI colors

