---
description: Read this before implementing or modifying authentication in the project.
---

# Authentication Guidelines

This document provides specific guidelines for implementing and working with authentication in this project.

## Core Principles

**IMPORTANT:** All authentication in this application is handled exclusively by Clerk. No other authentication methods, libraries, or custom auth implementations should be used.

## Authentication Provider

- **Provider:** Clerk (@clerk/nextjs 6.36.2)
- **Strategy:** Modal-based sign-in/sign-up
- **Session Management:** Handled automatically by Clerk

## Route Protection & Redirects

### Protected Routes

- `/dashboard` - **MUST** require authentication
- All routes under `/dashboard/*` should inherit this protection
- Use Clerk middleware or auth checks to enforce protection

### Redirect Rules

1. **Unauthenticated users accessing `/dashboard`:**

   - Redirect to homepage `/` or show Clerk sign-in modal

2. **Authenticated users accessing homepage `/`:**
   - Redirect to `/dashboard`

### Implementation Pattern

```typescript
// In middleware.ts or page component
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// Protect dashboard route
export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  // Dashboard content
}

// Redirect from homepage if authenticated
export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  // Homepage content
}
```

## Sign In / Sign Up UI

**REQUIRED:** All sign-in and sign-up flows must launch as modals, not full-page forms.

### Modal Configuration

Use Clerk's built-in modal components:

```tsx
import { SignInButton, SignUpButton } from "@clerk/nextjs";

// Sign In
<SignInButton mode="modal">
  <button>Sign In</button>
</SignInButton>

// Sign Up
<SignUpButton mode="modal">
  <button>Sign Up</button>
</SignUpButton>
```

### DO NOT:

- Create custom authentication forms
- Implement password validation or storage
- Build manual session management
- Use alternative auth libraries (NextAuth, Passport, etc.)

## Clerk Integration Checklist

### Root Layout Setup

- [ ] Wrap app with `<ClerkProvider>` in root layout
- [ ] Configure Clerk environment variables

### Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

### Common Clerk Hooks & Functions

**Client Components:**

```typescript
import { useUser, useAuth } from "@clerk/nextjs";

// Get current user
const { user, isLoaded, isSignedIn } = useUser();

// Get auth state
const { userId, sessionId } = useAuth();
```

**Server Components/Actions:**

```typescript
import { auth, currentUser } from "@clerk/nextjs/server";

// Get userId
const { userId } = await auth();

// Get full user object
const user = await currentUser();
```

## Database User Association

When storing user-related data:

1. Use `userId` from Clerk as the foreign key
2. Never store passwords or sensitive auth data
3. Always verify ownership on server actions:

```typescript
export async function updateLink(linkId: string, data: UpdateData) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const link = await db.query.links.findFirst({
    where: eq(links.id, linkId),
  });

  if (link.userId !== userId) {
    throw new Error("Forbidden");
  }

  // Proceed with update
}
```

## Security Best Practices

1. **Never trust client-side auth state** - Always verify on server
2. **Use Clerk's built-in middleware** - Don't reinvent route protection
3. **Validate userId on all server actions** - Check auth before data operations
4. **Leverage Clerk's session management** - Don't implement custom tokens

## Troubleshooting

- **Issue:** User not redirecting after sign-in

  - **Solution:** Ensure afterSignIn/afterSignUp URLs are configured in Clerk Dashboard

- **Issue:** Auth state not updating

  - **Solution:** Check that ClerkProvider wraps entire app in root layout

- **Issue:** Protected route accessible without auth
  - **Solution:** Add auth check at component/middleware level, not just UI

---

**Remember:** When in doubt, consult [Clerk's Next.js documentation](https://clerk.com/docs/quickstarts/nextjs). All auth concerns should be solved with Clerk's built-in features.
