const DB_NAME = "rf-auth";
const STORE_NAME = "tokens";
const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
export const AUTH_CHANGED_EVENT = "remote-auth-changed";
const AUTH_DEBUG_PREFIX = "[auth-debug][remote-web][auth-storage]";

function authDebug(message: string, data?: unknown): void {
  if (data === undefined) {
    console.debug(`${AUTH_DEBUG_PREFIX} ${message}`);
    return;
  }
  console.debug(`${AUTH_DEBUG_PREFIX} ${message}`, data);
}

function emitAuthChanged(): void {
  if (typeof window !== "undefined") {
    authDebug("dispatching auth changed event", { event: AUTH_CHANGED_EVENT });
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

function openDB(): Promise<IDBDatabase> {
  authDebug("openDB called", { dbName: DB_NAME, storeName: STORE_NAME });
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      authDebug("openDB onupgradeneeded creating object store", {
        dbName: DB_NAME,
        storeName: STORE_NAME,
      });
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      authDebug("openDB success");
      resolve(request.result);
    };
    request.onerror = () => {
      authDebug("openDB error", { error: request.error });
      reject(request.error);
    };
  });
}

function get(key: string): Promise<string | null> {
  authDebug("token read requested", { key });
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        let value: string | null = null;
        const req = tx.objectStore(STORE_NAME).get(key);

        req.onsuccess = () => {
          value = (req.result as string) ?? null;
          authDebug("token read success", { key, value });
        };
        req.onerror = () => {
          authDebug("token read request error", { key, error: req.error });
          reject(req.error);
        };
        tx.oncomplete = () => {
          authDebug("token read transaction complete", { key, value });
          resolve(value);
        };
        tx.onerror = () => {
          authDebug("token read transaction error", { key, error: tx.error });
          reject(tx.error);
        };
        tx.onabort = () => {
          authDebug("token read transaction aborted", { key, error: tx.error });
          reject(tx.error);
        };
      }),
  );
}

function put(key: string, value: string): Promise<void> {
  authDebug("token write requested", { key, value });
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const req = tx.objectStore(STORE_NAME).put(value, key);
        req.onerror = () => {
          authDebug("token write request error", { key, value, error: req.error });
          reject(req.error);
        };
        tx.oncomplete = () => {
          authDebug("token write transaction complete", { key, value });
          resolve();
        };
        tx.onerror = () => {
          authDebug("token write transaction error", { key, value, error: tx.error });
          reject(tx.error);
        };
        tx.onabort = () => {
          authDebug("token write transaction aborted", { key, value, error: tx.error });
          reject(tx.error);
        };
      }),
  );
}

function del(key: string): Promise<void> {
  authDebug("token delete requested", { key });
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const req = tx.objectStore(STORE_NAME).delete(key);
        req.onerror = () => {
          authDebug("token delete request error", { key, error: req.error });
          reject(req.error);
        };
        tx.oncomplete = () => {
          authDebug("token delete transaction complete", { key });
          resolve();
        };
        tx.onerror = () => {
          authDebug("token delete transaction error", { key, error: tx.error });
          reject(tx.error);
        };
        tx.onabort = () => {
          authDebug("token delete transaction aborted", { key, error: tx.error });
          reject(tx.error);
        };
      }),
  );
}

export async function storeTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  authDebug("storeTokens called", { accessToken, refreshToken });
  await put(ACCESS_TOKEN_KEY, accessToken);
  await put(REFRESH_TOKEN_KEY, refreshToken);
  authDebug("storeTokens completed");
  emitAuthChanged();
}

export function getAccessToken(): Promise<string | null> {
  authDebug("getAccessToken called");
  return get(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): Promise<string | null> {
  authDebug("getRefreshToken called");
  return get(REFRESH_TOKEN_KEY);
}

export async function clearAccessToken(): Promise<void> {
  authDebug("clearAccessToken called");
  await del(ACCESS_TOKEN_KEY);
  authDebug("clearAccessToken completed");
}

export async function clearTokens(): Promise<void> {
  authDebug("clearTokens called");
  await del(ACCESS_TOKEN_KEY);
  await del(REFRESH_TOKEN_KEY);
  authDebug("clearTokens completed");
  emitAuthChanged();
}

export async function isLoggedIn(): Promise<boolean> {
  authDebug("isLoggedIn called");
  const [access, refresh] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
  ]);
  authDebug("isLoggedIn token snapshot", { access, refresh });
  return access !== null && refresh !== null;
}
