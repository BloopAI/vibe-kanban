type PauseableShape = { pause: () => void; resume: () => void };

type CurrentUser = { user_id: string };

export interface AuthRuntime {
  getToken: () => Promise<string | null>;
  triggerRefresh: () => Promise<string | null>;
  registerShape: (shape: PauseableShape) => () => void;
  getCurrentUser: () => Promise<CurrentUser>;
}

/**
 * Local-first no-op runtime — no cloud auth, no tokens.
 * All methods return null/no-op so existing consumers don't crash.
 */
const LOCAL_RUNTIME: AuthRuntime = {
  getToken: () => Promise.resolve(null),
  triggerRefresh: () => Promise.resolve(null),
  registerShape: () => () => {},
  getCurrentUser: () => Promise.resolve({ user_id: 'local' }),
};

let authRuntime: AuthRuntime = LOCAL_RUNTIME;

export function configureAuthRuntime(runtime: AuthRuntime): void {
  authRuntime = runtime;
}

export function getAuthRuntime(): AuthRuntime {
  return authRuntime;
}
