---
description: Read this file before implementing or modifying server actions for data mutations in the project.
---

# Server Actions Instructions

## Overview

All data mutations in this application must be performed using Next.js Server Actions. This ensures proper security, type safety, and separation of concerns.

## Core Requirements

### 1. File Structure

- Server action files **MUST** be named `actions.ts`
- Server actions **MUST** be colocated in the same directory as the component that calls them
- Example: `app/dashboard/actions.ts` for actions called from `app/dashboard/page.tsx`

### 2. Client-Server Boundary

- Server actions **MUST** be called from client components
- Add `"use server"` directive at the top of action files
- Add `"use client"` directive to components calling server actions

### 3. Type Safety

- All data passed to server actions **MUST** have appropriate TypeScript types
- **DO NOT** use the `FormData` TypeScript type
- Define explicit interfaces or types for action parameters

Example:

```typescript
interface CreateLinkInput {
  url: string;
  customSlug?: string;
}

export async function createLink(input: CreateLinkInput) {
  // ...
}
```

### 4. Validation

- All input data **MUST** be validated using Zod
- Define Zod schemas for each action's input
- Validate at the beginning of every server action

Example:

```typescript
import { z } from "zod";

const createLinkSchema = z.object({
  url: z.string().url(),
  customSlug: z.string().optional(),
});

export async function createLink(input: unknown) {
  const validated = createLinkSchema.parse(input);
  // ...
}
```

### 5. Authentication

- All server actions **MUST** check for a logged-in user before proceeding
- Use Clerk's `auth()` function to get the current user
- Return an error object if user is not authenticated

Example:

```typescript
import { auth } from "@clerk/nextjs/server";

export async function createLink(input: CreateLinkInput) {
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }
  // ...
}
```

### 6. Database Operations

- Server actions **MUST NOT** directly use Drizzle queries
- All database operations **MUST** be done via helper functions
- Helper functions are located in the `/data` directory
- Server actions should call these helper functions

Example:

```typescript
// ❌ Wrong - Direct Drizzle query in action
export async function createLink(input: CreateLinkInput) {
  const { userId } = await auth();
  await db.insert(links).values({ ...input, userId });
}

// ✅ Correct - Using helper function
import { createLinkForUser } from "@/data/links";

export async function createLink(input: CreateLinkInput) {
  const { userId } = await auth();
  const validated = createLinkSchema.parse(input);
  return await createLinkForUser(userId, validated);
}
```

### 7. Error Handling

- Server actions **MUST NOT** throw errors
- Always return an object with either an `error` or `success` property
- Use try-catch blocks to handle validation and database errors
- Provide meaningful error messages to the client

Example:

```typescript
export async function createLink(input: unknown) {
  try {
    const validated = createLinkSchema.parse(input);
    const link = await createLinkForUser(userId, validated);
    return { success: true, data: link };
  } catch (error) {
    return { error: "Failed to create link" };
  }
}
```

## Complete Example

```typescript
"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { createLinkForUser } from "@/data/links";

const createLinkSchema = z.object({
  url: z.string().url(),
  customSlug: z.string().min(3).optional(),
});

export async function createLink(input: unknown) {
  // 1. Check authentication
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized" };
  }

  // 2. Validate input and perform database operation
  try {
    const validated = createLinkSchema.parse(input);
    const link = await createLinkForUser(userId, validated);
    return { success: true, data: link };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: "Invalid input data" };
    }
    return { error: "Failed to create link" };
  }
}
```

## Summary Checklist

- [ ] File named `actions.ts` and colocated with component
- [ ] Called from client component
- [ ] Uses explicit TypeScript types (not FormData)
- [ ] Validates input with Zod
- [ ] Checks authentication with `auth()`
- [ ] Uses helper functions from `/data` directory for database operations
- [ ] Returns error/success objects instead of throwing errors
- [ ] Wrapped in try-catch blocks for proper error handling
