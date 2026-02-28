import {
  getActiveRelayHostId,
  parseRelayHostIdFromSearch,
  setActiveRelayHostId,
} from "@remote/shared/lib/activeRelayHost";

export function isWorkspaceRoutePath(pathname: string): boolean {
  if (pathname === "/workspaces" || pathname.startsWith("/workspaces/")) {
    return true;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "projects" || !segments[1]) {
    return false;
  }

  const isIssueWorkspacePath =
    segments[2] === "issues" &&
    !!segments[3] &&
    segments[4] === "workspaces" &&
    !!segments[5];

  const isProjectWorkspaceCreatePath =
    segments[2] === "workspaces" && segments[3] === "create" && !!segments[4];

  return isIssueWorkspacePath || isProjectWorkspaceCreatePath;
}

export function resolveRelayHostIdForCurrentPage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!isWorkspaceRoutePath(window.location.pathname)) {
    return null;
  }

  const hostIdFromSearch = parseRelayHostIdFromSearch(window.location.search);
  if (hostIdFromSearch) {
    setActiveRelayHostId(hostIdFromSearch);
    return hostIdFromSearch;
  }

  return getActiveRelayHostId();
}

export function shouldRelayApiPath(pathAndQuery: string): boolean {
  const [path] = pathAndQuery.split("?");
  if (!path.startsWith("/api/")) {
    return false;
  }

  return !path.startsWith("/api/remote/");
}

export function normalizePath(pathAndQuery: string): string {
  return pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
}

export function toPathAndQuery(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl) || /^wss?:\/\//i.test(pathOrUrl)) {
    const url = new URL(pathOrUrl);
    return `${url.pathname}${url.search}`;
  }

  return pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
}

export function openBrowserWebSocket(pathOrUrl: string): WebSocket {
  if (/^wss?:\/\//i.test(pathOrUrl)) {
    return new WebSocket(pathOrUrl);
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return new WebSocket(pathOrUrl.replace(/^http/i, "ws"));
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const normalizedPath = pathOrUrl.startsWith("/")
    ? pathOrUrl
    : `/${pathOrUrl}`;
  return new WebSocket(`${protocol}//${window.location.host}${normalizedPath}`);
}
