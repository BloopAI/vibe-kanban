export function isWorkspaceRoutePath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "hosts" || !segments[1]) {
    return false;
  }

  if (segments[2] === "workspaces") {
    return true;
  }

  if (segments[2] !== "projects" || !segments[3]) {
    return false;
  }

  const isIssueWorkspacePath =
    segments[4] === "issues" &&
    !!segments[5] &&
    segments[6] === "workspaces" &&
    !!segments[7];

  const isProjectWorkspaceCreatePath =
    segments[4] === "workspaces" && segments[5] === "create" && !!segments[6];

  return isIssueWorkspacePath || isProjectWorkspaceCreatePath;
}

export function parseRelayHostIdFromPathname(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "hosts" || !segments[1]) {
    return null;
  }

  return segments[1];
}

export function resolveRelayHostIdForCurrentPage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseRelayHostIdFromPathname(window.location.pathname);
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
