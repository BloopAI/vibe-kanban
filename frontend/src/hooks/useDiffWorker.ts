import { useEffect, useRef, useState } from 'react';
import { DiffFile } from '@git-diff-view/react';
import { generateDiffFile } from '@git-diff-view/file';
import type { DiffWorkerInput, DiffWorkerOutput } from '@/workers/diff.worker';

type DiffFileBundle = ReturnType<DiffFile['_getFullBundle']>;

type DiffWorkerResult = {
  diffFile: DiffFile | null;
  additions: number;
  deletions: number;
};

type CachedDiffData = {
  bundle: DiffFileBundle;
  additions: number;
  deletions: number;
};

type PendingRequest = {
  resolve: (result: DiffWorkerResult) => void;
  reject: (error: Error) => void;
};

type CacheEntry = {
  data: CachedDiffData;
  timestamp: number;
};

const SMALL_DIFF_THRESHOLD = 5000;
const CACHE_MAX_SIZE = 50;
const CACHE_TTL_MS = 5 * 60 * 1000;
const LOADING_DELAY_MS = 120;

let workerInstance: Worker | null = null;
const pendingRequests: Map<number, PendingRequest> = new Map();
const diffCache: Map<string, CacheEntry> = new Map();
const prefetchInFlight: Set<string> = new Set();
let requestIdCounter = 0;

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getCacheKey(params: DiffWorkerParams): string {
  const oldHash = simpleHash(params.oldContent);
  const newHash = simpleHash(params.newContent);
  return `${oldHash}:${newHash}:${params.oldLang}:${params.newLang}:${params.theme}`;
}

export function preloadDiffWorker(): void {
  getWorker();
}

export function getCachedDiffStats(
  params: DiffWorkerParams
): { additions: number; deletions: number } | null {
  const cacheKey = getCacheKey(params);
  const cached = getCachedData(cacheKey);
  if (cached) {
    return { additions: cached.additions, deletions: cached.deletions };
  }
  return null;
}

function getCachedDiffResult(
  params: DiffWorkerParams
): DiffWorkerResult | null {
  const cacheKey = getCacheKey(params);
  const cached = getCachedData(cacheKey);
  if (!cached) return null;
  return {
    diffFile: createDiffFileFromBundle(cached.bundle),
    additions: cached.additions,
    deletions: cached.deletions,
  };
}

function getCachedData(key: string): CachedDiffData | null {
  const entry = diffCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    diffCache.delete(key);
    return null;
  }

  return entry.data;
}

function setCachedData(key: string, data: CachedDiffData): void {
  if (diffCache.size >= CACHE_MAX_SIZE) {
    const firstKey = diffCache.keys().next().value;
    if (firstKey) diffCache.delete(firstKey);
  }
  diffCache.set(key, { data, timestamp: Date.now() });
}

function createDiffFileFromBundle(bundle: DiffFileBundle): DiffFile {
  return DiffFile.createInstance({}, bundle);
}

function computeDiffSync(params: DiffWorkerParams): CachedDiffData {
  const file = generateDiffFile(
    params.oldFileName,
    params.oldContent,
    params.newFileName,
    params.newContent,
    params.oldLang,
    params.newLang
  );

  file.initTheme(params.theme);

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    file.initRaw();
  } finally {
    console.warn = originalWarn;
  }

  file.buildSplitDiffLines();
  file.buildUnifiedDiffLines();

  const bundle = file._getFullBundle();
  const additions = file.additionLength ?? 0;
  const deletions = file.deletionLength ?? 0;

  file.clear();

  return { bundle, additions, deletions };
}

function isSmallDiff(params: DiffWorkerParams): boolean {
  return (
    params.oldContent.length + params.newContent.length < SMALL_DIFF_THRESHOLD
  );
}

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../workers/diff.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerInstance.onmessage = (event: MessageEvent<DiffWorkerOutput>) => {
      const { id, bundle, additions, deletions, error } = event.data;
      const pending = pendingRequests.get(id);

      if (pending) {
        pendingRequests.delete(id);

        if (error) {
          pending.reject(new Error(error));
        } else if (bundle) {
          const diffFile = DiffFile.createInstance({}, bundle);
          pending.resolve({
            diffFile,
            additions: additions ?? 0,
            deletions: deletions ?? 0,
          });
        } else {
          pending.reject(new Error('No bundle returned from worker'));
        }
      }
    };

    workerInstance.onerror = (error) => {
      console.error('Diff worker error:', error);
      pendingRequests.forEach((pending) => {
        pending.reject(new Error('Worker error'));
      });
      pendingRequests.clear();
    };
  }

  return workerInstance;
}

export interface DiffWorkerParams {
  oldFileName: string;
  oldContent: string;
  newFileName: string;
  newContent: string;
  oldLang: string;
  newLang: string;
  theme?: 'light' | 'dark';
}

export function computeDiffInWorker(
  params: DiffWorkerParams
): Promise<DiffWorkerResult> {
  const cacheKey = getCacheKey(params);
  const cached = getCachedData(cacheKey);
  if (cached) {
    return Promise.resolve({
      diffFile: createDiffFileFromBundle(cached.bundle),
      additions: cached.additions,
      deletions: cached.deletions,
    });
  }

  if (isSmallDiff(params)) {
    try {
      const data = computeDiffSync(params);
      setCachedData(cacheKey, data);
      return Promise.resolve({
        diffFile: createDiffFileFromBundle(data.bundle),
        additions: data.additions,
        deletions: data.deletions,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  return new Promise((resolve, reject) => {
    const id = ++requestIdCounter;
    const worker = getWorker();

    pendingRequests.set(id, {
      resolve: (result) => {
        if (result.diffFile) {
          const bundle = result.diffFile._getFullBundle();
          setCachedData(cacheKey, {
            bundle,
            additions: result.additions,
            deletions: result.deletions,
          });
        }
        resolve(result);
      },
      reject,
    });

    const input: DiffWorkerInput = {
      id,
      ...params,
    };

    worker.postMessage(input);
  });
}

export function prefetchDiff(params: DiffWorkerParams): void {
  if (isSmallDiff(params)) return;

  const cacheKey = getCacheKey(params);
  if (getCachedData(cacheKey) || prefetchInFlight.has(cacheKey)) {
    return;
  }

  prefetchInFlight.add(cacheKey);
  computeDiffInWorker(params)
    .then((result) => {
      result.diffFile?.clear?.();
    })
    .catch((error) => {
      console.warn('Failed to prefetch diff', error);
    })
    .finally(() => {
      prefetchInFlight.delete(cacheKey);
    });
}

export interface UseDiffWorkerOptions {
  oldFileName: string;
  oldContent: string;
  newFileName: string;
  newContent: string;
  oldLang: string;
  newLang: string;
  theme?: 'light' | 'dark';
  enabled?: boolean;
}

export interface UseDiffWorkerResult {
  diffFile: DiffFile | null;
  additions: number;
  deletions: number;
  isLoading: boolean;
  error: Error | null;
}

export function useDiffWorker(
  options: UseDiffWorkerOptions
): UseDiffWorkerResult {
  const {
    oldFileName,
    oldContent,
    newFileName,
    newContent,
    oldLang,
    newLang,
    theme,
    enabled = true,
  } = options;

  const [result, setResult] = useState<UseDiffWorkerResult>({
    diffFile: null,
    additions: 0,
    deletions: 0,
    isLoading: false,
    error: null,
  });

  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }

    if (!enabled) {
      setResult({
        diffFile: null,
        additions: 0,
        deletions: 0,
        isLoading: false,
        error: null,
      });
      return;
    }

    if (oldContent === newContent) {
      setResult({
        diffFile: null,
        additions: 0,
        deletions: 0,
        isLoading: false,
        error: null,
      });
      return;
    }

    const cachedResult = getCachedDiffResult({
      oldFileName,
      oldContent,
      newFileName,
      newContent,
      oldLang,
      newLang,
      theme,
    });
    if (cachedResult) {
      setResult({
        diffFile: cachedResult.diffFile,
        additions: cachedResult.additions,
        deletions: cachedResult.deletions,
        isLoading: false,
        error: null,
      });
      return;
    }

    loadingTimerRef.current = setTimeout(() => {
      setResult((prev) => ({ ...prev, isLoading: true, error: null }));
    }, LOADING_DELAY_MS);

    let cancelled = false;

    computeDiffInWorker({
      oldFileName,
      oldContent,
      newFileName,
      newContent,
      oldLang,
      newLang,
      theme,
    })
      .then((workerResult) => {
        if (cancelled) {
          return;
        }

        if (loadingTimerRef.current) {
          clearTimeout(loadingTimerRef.current);
          loadingTimerRef.current = null;
        }

        setResult({
          diffFile: workerResult.diffFile,
          additions: workerResult.additions,
          deletions: workerResult.deletions,
          isLoading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;

        if (loadingTimerRef.current) {
          clearTimeout(loadingTimerRef.current);
          loadingTimerRef.current = null;
        }

        setResult({
          diffFile: null,
          additions: 0,
          deletions: 0,
          isLoading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

    return () => {
      cancelled = true;
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    };
  }, [
    enabled,
    oldFileName,
    oldContent,
    newFileName,
    newContent,
    oldLang,
    newLang,
    theme,
  ]);

  return result;
}
