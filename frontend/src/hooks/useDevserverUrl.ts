import { useEffect, useRef, useState } from 'react';
import { stripAnsi } from 'fancy-ansi';

const urlPatterns = [
  /(https?:\/\/(?:\[[0-9a-f:]+\]|localhost|127\.0\.0\.1|0\.0\.0\.0|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})?(?:\/\S*)?)/i,
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[0-9a-f:]+\]|(?:\d{1,3}\.){3}\d{1,3}):(\d{2,5})/i,
];

export type DevserverUrlInfo = {
  url: string;
  port?: number;
  scheme: 'http' | 'https';
};

export const detectDevserverUrl = (line: string): DevserverUrlInfo | null => {
  const cleaned = stripAnsi(line);

  const fullUrlMatch = urlPatterns[0].exec(cleaned);
  if (fullUrlMatch) {
    try {
      const parsed = new URL(fullUrlMatch[1]);
      if (
        parsed.hostname === '0.0.0.0' ||
        parsed.hostname === '::' ||
        parsed.hostname === '[::]'
      ) {
        parsed.hostname = 'localhost';
      }
      return {
        url: parsed.toString(),
        port: parsed.port ? Number(parsed.port) : undefined,
        scheme: parsed.protocol === 'https:' ? 'https' : 'http',
      };
    } catch {
      // Ignore invalid URLs and fall through to host:port detection.
    }
  }

  const hostPortMatch = urlPatterns[1].exec(cleaned);
  if (hostPortMatch) {
    const port = Number(hostPortMatch[1]);
    const scheme = /https/i.test(cleaned) ? 'https' : 'http';
    return {
      url: `${scheme}://localhost:${port}`,
      port,
      scheme: scheme as 'http' | 'https',
    };
  }

  return null;
};

export const useDevserverUrlFromLogs = (
  logs: Array<{ content: string }> | undefined
): DevserverUrlInfo | undefined => {
  const [urlInfo, setUrlInfo] = useState<DevserverUrlInfo | undefined>();
  const lastIndexRef = useRef(0);

  useEffect(() => {
    if (!logs) {
      setUrlInfo(undefined);
      lastIndexRef.current = 0;
      return;
    }

    if (logs.length < lastIndexRef.current) {
      lastIndexRef.current = 0;
      setUrlInfo(undefined);
    }

    for (let i = logs.length - 1; i >= lastIndexRef.current; i -= 1) {
      const detected = detectDevserverUrl(logs[i].content);
      if (detected) {
        setUrlInfo((prev) =>
          prev && prev.url === detected.url ? prev : detected
        );
        break;
      }
    }

    lastIndexRef.current = logs.length;
  }, [logs]);

  return urlInfo;
};
