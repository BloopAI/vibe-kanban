# UI Components (shadcn/ui) — Agent Instructions

This file documents the required UI component patterns for this project. Read and follow these rules before creating or installing any UI components.

## Core Rule

- **Only use shadcn/ui components.** Do not create custom components. Do not use other UI libraries or frameworks.

## Installation & Usage

- Install components via `npx shadcn-ui@latest add <component-name>` when needed.
- Components are installed to the `src/components/ui/` directory.
- Import components directly: `import { Button } from "@/components/ui/button"`

## Component Adoption

- Always prefer shadcn/ui components for all UI elements: buttons, forms, cards, dialogs, dropdowns, navigation, alerts, badges, etc.
- If a shadcn/ui component exists for the desired functionality, use it without modification.
- Do not create wrapper or custom components around shadcn/ui components unless absolutely necessary for project-specific business logic.

## Styling

- shadcn/ui components use Tailwind CSS v4.
- Apply custom styling via Tailwind classes passed to component props (e.g., `className`).
- Follow Tailwind CSS conventions for consistency with the rest of the project.
- Do not override component styles with custom CSS unless unavoidable.

## When to Add a New Component

- Install a new shadcn/ui component only when it does not already exist in the project.
- Check `src/components/ui/` first to see what components are available.
- If the desired component is not available, run `npx shadcn-ui@latest add <component-name>`.

## Available Components

Refer to the [shadcn/ui documentation](https://ui.shadcn.com) for the full list of available components and their props.

If a required component is not yet installed, install it before using it.
