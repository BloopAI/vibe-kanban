const DB_NAME = 'vk-relay-pairing';
const DB_VERSION = 1;
const PAIRED_HOSTS_STORE = 'paired_hosts';

type RelayPairingChangeType = 'saved' | 'removed';

export interface RelayPairingChange {
  hostId: string;
  type: RelayPairingChangeType;
}

type RelayPairingChangeListener = (change: RelayPairingChange) => void;

const relayPairingChangeListeners = new Set<RelayPairingChangeListener>();

export interface PairedRelayHost {
  host_id: string;
  host_name: string;
  client_id?: string;
  client_name?: string;
  signing_session_id?: string;
  public_key_b64: string;
  private_key_jwk: JsonWebKey;
  server_public_key_b64: string;
  paired_at: string;
}

export function subscribeRelayPairingChanges(
  listener: RelayPairingChangeListener
): () => void {
  relayPairingChangeListeners.add(listener);
  return () => {
    relayPairingChangeListeners.delete(listener);
  };
}

function emitRelayPairingChange(change: RelayPairingChange): void {
  for (const listener of relayPairingChangeListeners) {
    try {
      listener(change);
    } catch (error) {
      console.error('relay pairing change listener failed', error);
    }
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PAIRED_HOSTS_STORE)) {
        db.createObjectStore(PAIRED_HOSTS_STORE, { keyPath: 'host_id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listPairedRelayHosts(): Promise<PairedRelayHost[]> {
  const db = await openDb();
  return new Promise<PairedRelayHost[]>((resolve, reject) => {
    const tx = db.transaction(PAIRED_HOSTS_STORE, 'readonly');
    const store = tx.objectStore(PAIRED_HOSTS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const pairedHosts = (request.result as PairedRelayHost[]) ?? [];
      pairedHosts.sort((a, b) => b.paired_at.localeCompare(a.paired_at));
      resolve(pairedHosts);
    };
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => {
      db.close();
    };
  });
}

export async function savePairedRelayHost(
  host: PairedRelayHost
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PAIRED_HOSTS_STORE, 'readwrite');
    const store = tx.objectStore(PAIRED_HOSTS_STORE);
    const request = store.put(host);

    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => {
      db.close();
      emitRelayPairingChange({ hostId: host.host_id, type: 'saved' });
      resolve();
    };
  });
}

export async function removePairedRelayHost(hostId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PAIRED_HOSTS_STORE, 'readwrite');
    const store = tx.objectStore(PAIRED_HOSTS_STORE);
    const request = store.delete(hostId);

    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => {
      db.close();
      emitRelayPairingChange({ hostId, type: 'removed' });
      resolve();
    };
  });
}
