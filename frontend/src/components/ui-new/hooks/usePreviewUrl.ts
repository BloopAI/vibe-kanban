import { useEffect, useRef, useState } from 'react';
import { stripAnsi } from 'fancy-ansi';

export interface PreviewUrlInfo {
  url: string;
  port?: number;
  scheme: 'http' | 'https';
}

const urlPatterns = [
  // Full URL pattern (e.g., http://localhost:3000, https://127.0.0.1:8080)
  /(https?:\/\/(?:\[[0-9a-f:]+\]|localhost|127\.0\.0\.1|0\.0\.0\.0|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})?(?:\/\S*)?)/i,
  // Host:port pattern (e.g., localhost:3000, 0.0.0.0:8080)
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[0-9a-f:]+\]|(?:\d{1,3}\.){3}\d{1,3}):(\d{2,5})/i,
];

// Get the hostname from the current browser location, falling back to 'localhost'
const getBrowserHostname = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return 'localhost';
};

export const detectPreviewUrl = (line: string): PreviewUrlInfo | null => {
  const cleaned = stripAnsi(line);
  const browserHostname = getBrowserHostname();

  // Try to match a full URL first
  const fullUrlMatch = urlPatterns[0].exec(cleaned);
  if (fullUrlMatch) {
    try {
      const parsed = new URL(fullUrlMatch[1]);

      // Reject localhost/loopback URLs without a port - they're not valid dev server URLs
      const isLocalhost = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::',
        '[::]',
      ].includes(parsed.hostname);

      if (isLocalhost && !parsed.port) {
        // Fall through to host:port pattern detection
      } else {
        // Replace 0.0.0.0 or :: with browser hostname
        if (
          parsed.hostname === '0.0.0.0' ||
          parsed.hostname === '::' ||
          parsed.hostname === '[::]'
        ) {
          parsed.hostname = browserHostname;
        }
        return {
          url: parsed.toString(),
          port: parsed.port ? Number(parsed.port) : undefined,
          scheme: parsed.protocol === 'https:' ? 'https' : 'http',
        };
      }
    } catch {
      // Ignore invalid URLs and fall through to host:port detection
    }
  }

  // Try to match host:port pattern
  const hostPortMatch = urlPatterns[1].exec(cleaned);
  if (hostPortMatch) {
    const port = Number(hostPortMatch[1]);
    const scheme = /https/i.test(cleaned) ? 'https' : 'http';
    return {
      url: `${scheme}://${browserHostname}:${port}`,
      port,
      scheme: scheme as 'http' | 'https',
    };
  }

  return null;
};

export function usePreviewUrl(
  logs: Array<{ content: string }> | undefined
): PreviewUrlInfo | undefined {
  const [urlInfo, setUrlInfo] = useState<PreviewUrlInfo | undefined>();
  const lastIndexRef = useRef(0);

  useEffect(() => {
    if (!logs) {
      setUrlInfo(undefined);
      lastIndexRef.current = 0;
      return;
    }

    // Reset if logs were cleared (new process started)
    if (logs.length < lastIndexRef.current) {
      lastIndexRef.current = 0;
      setUrlInfo(undefined);
    }

    // If we already have a URL, just update the index and skip
    if (urlInfo) {
      lastIndexRef.current = logs.length;
      return;
    }

    // Scan new log entries for URL
    let detectedUrl: PreviewUrlInfo | undefined;
    const newEntries = logs.slice(lastIndexRef.current);
    newEntries.some((entry) => {
      const detected = detectPreviewUrl(entry.content);
      if (detected) {
        detectedUrl = detected;
        return true;
      }
      return false;
    });

    if (detectedUrl) {
      setUrlInfo((prev) => prev ?? detectedUrl);
    }

    lastIndexRef.current = logs.length;
  }, [logs, urlInfo]);

  return urlInfo;
}
