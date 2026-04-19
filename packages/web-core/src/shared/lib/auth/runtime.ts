type PauseableShape = { pause: () => void; resume: () => void };

type CurrentUser = { user_id: string };

export interface AuthRuntime {
  getToken: () => Promise<string | null>;
  triggerRefresh: () => Promise<string | null>;
  registerShape: (shape: PauseableShape) => () => void;
  getCurrentUser: () => Promise<CurrentUser>;
}

let authRuntime: AuthRuntime | null = null;
let localOnly = false;

// Deterministic ID matching the seeded "Local User" in the Rust migration
// (`crates/db/migrations/20260420000000_local_remote_core.sql`).
const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000001';
const LOCAL_TOKEN = 'local';

const LOCAL_RUNTIME: AuthRuntime = {
  getToken: async () => LOCAL_TOKEN,
  triggerRefresh: async () => LOCAL_TOKEN,
  registerShape: () => () => {},
  getCurrentUser: async () => ({ user_id: LOCAL_USER_ID }),
};

export function configureAuthRuntime(runtime: AuthRuntime): void {
  authRuntime = runtime;
}

/**
 * Switch the auth runtime to local-only mode (embedded desktop server).
 * After this, all token requests resolve to a static placeholder token and
 * `getCurrentUser()` returns the seeded local user. Idempotent.
 */
export function setLocalOnlyMode(enabled: boolean): void {
  localOnly = enabled;
}

export function isLocalOnlyMode(): boolean {
  return localOnly;
}

export function getAuthRuntime(): AuthRuntime {
  if (localOnly) {
    return LOCAL_RUNTIME;
  }
  if (!authRuntime) {
    throw new Error('Auth runtime has not been configured');
  }

  return authRuntime;
}
