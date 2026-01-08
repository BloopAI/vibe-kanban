---
description: Read this before creating or modifying UI components in the project.
---

# UI Components Guidelines

## Overview

This project uses **shadcn/ui** exclusively for all UI components. Do not create custom components when shadcn/ui provides an equivalent.

## Core Principles

1. **shadcn/ui First**

   - Always use shadcn/ui components for UI elements
   - Never create custom components that duplicate shadcn/ui functionality
   - Check [shadcn/ui documentation](https://ui.shadcn.com) before implementing any UI element

2. **Component Installation**

   ```bash
   npx shadcn@latest add <component-name>
   ```

   - Install components as needed using the shadcn CLI
   - Components are added to `components/ui/` directory
   - Each component is customizable through the components.json config

3. **Available Components**
   Common shadcn/ui components include:
   - **Forms:** Button, Input, Textarea, Select, Checkbox, RadioGroup, Switch, Label
   - **Layout:** Card, Separator, Tabs, Dialog, Sheet, Popover
   - **Feedback:** Alert, Toast, Badge, Progress, Skeleton
   - **Data Display:** Table, Avatar, Accordion, Tooltip
   - **Navigation:** Command, NavigationMenu, DropdownMenu

## Implementation Guidelines

### Using Components

```typescript
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Title</CardTitle>
      </CardHeader>
      <CardContent>
        <Input placeholder="Enter text" />
        <Button>Submit</Button>
      </CardContent>
    </Card>
  );
}
```

### Customization

- Use `className` prop with Tailwind utilities for styling
- Use variant props provided by each component
- Modify component source in `components/ui/` if needed for project-wide changes

### Composition Over Creation

- Compose existing shadcn/ui components to build complex UI
- Create wrapper components that use shadcn/ui internally
- Only create truly custom components when shadcn/ui has no equivalent

## Example: DON'T vs DO

### ❌ DON'T - Create Custom Component

```typescript
// DON'T create this
export function CustomButton({ children, onClick }) {
  return (
    <button className="px-4 py-2 bg-blue-500 rounded" onClick={onClick}>
      {children}
    </button>
  );
}
```

### ✅ DO - Use shadcn/ui Component

```typescript
import { Button } from "@/components/ui/button";

export function MyFeature() {
  return <Button onClick={handleClick}>Click Me</Button>;
}
```

## Quick Reference

- **Documentation:** https://ui.shadcn.com
- **Component Location:** `components/ui/`
- **Configuration:** `components.json`
- **Installation Command:** `npx shadcn@latest add [component]`

---

**Remember:** If you're about to create a UI component, check shadcn/ui first. It likely already exists.
