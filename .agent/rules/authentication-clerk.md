# Authentication (Clerk) — Agent Instructions

This file documents the required authentication patterns for this project. Read and follow these rules before implementing or changing any auth-related code.

- **Auth provider:** Clerk only. Do not add or use any other authentication providers or custom auth implementations.
- **Root provider:** Wrap the application with ClerkProvider in the root layout. Use Clerk hooks (e.g., `useAuth`, `auth()`) for server- and client-side checks.
- **Protected route:** `/dashboard` must require an authenticated user. Deny access and redirect to sign-in if not authenticated.
- **Homepage behavior:** If a user is authenticated and visits the homepage (`/`), redirect them to `/dashboard`.
- **Sign-in / Sign-up UX:** Always open Clerk sign-in and sign-up flows as modal dialogs rather than full-page navigation.
- **Authorization checks:** Always verify ownership and permissions on the server before performing data operations. Do not rely solely on client-side checks.
- **Session handling:** Use Clerk session/user IDs for database associations and server actions.

Implementation notes for agents:

- Check the root `layout.tsx` for the ClerkProvider wrapper; add it if missing.
- Implement route protection using server-side checks where possible (e.g., Next.js server components or route handlers) and fall back to Clerk's client hooks in client components.
- For redirects, prefer server-side redirects when possible to avoid flash of unauthenticated content.
- Ensure modal sign-in/sign-up is triggered via the Clerk client SDK/modal component.

If anything in these rules is unclear, ask for clarification before implementing changes.
