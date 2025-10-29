let lastRegisteredClerkToken: string | null = null;
let registerTokenPromise: Promise<void> | null = null;
let clearTokenPromise: Promise<void> | null = null;

export async function buildClerkAuthHeaders(
  base?: HeadersInit
): Promise<Headers> {
  const headers = base instanceof Headers ? base : new Headers(base ?? {});
  const token = await getClerkToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Clerk-Token', token);
    await registerClerkSession(token);
  } else {
    await maybeClearClerkSession();
  }

  return headers;
}

export async function refreshClerkSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  const clerk = window.Clerk;

  if (!clerk?.session) {
    await maybeClearClerkSession();
    return;
  }

  try {
    const token = await clerk.session.getToken({ skipCache: true });

    if (token) {
      await registerClerkSession(token);
    } else {
      await maybeClearClerkSession();
    }
  } catch (error) {
    console.warn('Failed to refresh Clerk session token', error);
  }
}

async function getClerkToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const clerk = window.Clerk;
  if (!clerk?.session) return null;

  try {
    const token = await clerk.session.getToken();
    return token ?? null;
  } catch (error) {
    console.warn('Failed to acquire Clerk token', error);
    return null;
  }
}

async function registerClerkSession(token: string): Promise<void> {
  if (!token) return;

  if (registerTokenPromise) {
    await registerTokenPromise;
  }

  if (token === lastRegisteredClerkToken) {
    return;
  }

  registerTokenPromise = (async () => {
    try {
      const response = await fetch('/api/auth/clerk/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        console.warn(
          'Failed to register Clerk session',
          response.status,
          await safeParseJson(response)
        );
        return;
      }

      lastRegisteredClerkToken = token;
    } catch (error) {
      console.warn('Unable to register Clerk session', error);
    } finally {
      registerTokenPromise = null;
    }
  })();

  await registerTokenPromise;
}

async function maybeClearClerkSession(): Promise<void> {
  if (!lastRegisteredClerkToken) {
    return;
  }

  if (clearTokenPromise) {
    await clearTokenPromise;
    return;
  }

  clearTokenPromise = (async () => {
    try {
      const response = await fetch('/api/auth/clerk/session', {
        method: 'DELETE',
      });

      if (!response.ok) {
        console.warn(
          'Failed to clear Clerk session',
          response.status,
          await safeParseJson(response)
        );
        return;
      }

      lastRegisteredClerkToken = null;
    } catch (error) {
      console.warn('Unable to clear Clerk session', error);
    } finally {
      clearTokenPromise = null;
    }
  })();

  await clearTokenPromise;
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
