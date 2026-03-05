import { normalizeEnrollmentCode } from '@/shared/lib/relayPake';

export type RemoteCloudHostStatus = 'online' | 'offline' | 'unpaired';

export interface RemoteCloudHost {
  id: string;
  name: string;
  baseUrl: string;
  status: RemoteCloudHostStatus;
  pairedAt: string;
  lastUsedAt: string;
}

export interface RemoteCloudHostsState {
  hosts: RemoteCloudHost[];
  activeHostId: string | null;
}

export interface PairRemoteCloudHostInput {
  baseUrl: string;
  pairingCode: string;
  hostName?: string;
}

const STORAGE_KEY = 'vk-remote-cloud-hosts-ui-state';
const listeners = new Set<() => void>();
let storageListenerInitialized = false;
const PAIRING_CODE_REGEX = /^[A-Z0-9]{6}$/;

const EMPTY_STATE: RemoteCloudHostsState = {
  hosts: [],
  activeHostId: null,
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Host URL is required.');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error('Host URL must use http or https.');
  }

  return parsed.toString().replace(/\/$/, '');
}

function deriveHostName(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    return parsed.hostname;
  } catch {
    return baseUrl;
  }
}

function createId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `host_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function ensureStorageListener(): void {
  if (storageListenerInitialized || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      notify();
    }
  });

  storageListenerInitialized = true;
}

function readState(): RemoteCloudHostsState {
  if (typeof window === 'undefined') {
    return EMPTY_STATE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_STATE;
    }

    const parsed = JSON.parse(raw) as Partial<RemoteCloudHostsState>;
    const hosts = Array.isArray(parsed.hosts)
      ? parsed.hosts.filter(isRemoteCloudHost)
      : [];

    const activeHostId =
      typeof parsed.activeHostId === 'string' ? parsed.activeHostId : null;

    return {
      hosts,
      activeHostId:
        activeHostId && hosts.some((host) => host.id === activeHostId)
          ? activeHostId
          : (hosts[0]?.id ?? null),
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeState(nextState: RemoteCloudHostsState): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }

  notify();
}

function isRemoteCloudHost(value: unknown): value is RemoteCloudHost {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RemoteCloudHost>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.baseUrl === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.pairedAt === 'string' &&
    typeof candidate.lastUsedAt === 'string'
  );
}

export function subscribeRemoteCloudHostsStore(
  listener: () => void
): () => void {
  ensureStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getRemoteCloudHostsState(): Promise<RemoteCloudHostsState> {
  return readState();
}

export async function pairRemoteCloudHost(
  input: PairRemoteCloudHostInput
): Promise<RemoteCloudHost> {
  const normalizedCode = normalizeEnrollmentCode(input.pairingCode);
  if (!PAIRING_CODE_REGEX.test(normalizedCode)) {
    throw new Error('Pairing code must contain 6 characters.');
  }

  const baseUrl = normalizeUrl(input.baseUrl);
  const hostName = input.hostName?.trim() || deriveHostName(baseUrl);
  const currentState = readState();
  const existingByUrl = currentState.hosts.find(
    (host) => host.baseUrl.toLowerCase() === baseUrl.toLowerCase()
  );
  const timestamp = nowIso();

  const nextHost: RemoteCloudHost = existingByUrl
    ? {
        ...existingByUrl,
        name: hostName,
        status: 'online',
        lastUsedAt: timestamp,
      }
    : {
        id: createId(),
        name: hostName,
        baseUrl,
        status: 'online',
        pairedAt: timestamp,
        lastUsedAt: timestamp,
      };

  const nextHosts = existingByUrl
    ? currentState.hosts.map((host) =>
        host.id === existingByUrl.id ? nextHost : host
      )
    : [nextHost, ...currentState.hosts];

  writeState({
    hosts: nextHosts,
    activeHostId: nextHost.id,
  });

  return nextHost;
}

export async function removeRemoteCloudHost(hostId: string): Promise<void> {
  const currentState = readState();
  const nextHosts = currentState.hosts.filter((host) => host.id !== hostId);

  writeState({
    hosts: nextHosts,
    activeHostId:
      currentState.activeHostId === hostId
        ? (nextHosts[0]?.id ?? null)
        : currentState.activeHostId,
  });
}

export async function setActiveRemoteCloudHost(hostId: string): Promise<void> {
  const currentState = readState();
  const existingHost = currentState.hosts.find((host) => host.id === hostId);

  if (!existingHost) {
    throw new Error('Host not found.');
  }

  const timestamp = nowIso();
  writeState({
    hosts: currentState.hosts.map((host) =>
      host.id === hostId ? { ...host, lastUsedAt: timestamp } : host
    ),
    activeHostId: hostId,
  });
}
