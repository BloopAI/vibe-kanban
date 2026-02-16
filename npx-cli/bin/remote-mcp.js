#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const REMOTE_BASE_URL = (
  process.env.VK_SHARED_API_BASE || 'https://api.vibekanban.com'
).replace(/\/$/, '');

const PACKAGE_VERSION = (() => {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
})();

const SERVER_INFO = {
  name: 'vibe-kanban-remote',
  version: PACKAGE_VERSION,
};

const REMOTE_TYPES_FILE_CANDIDATES = [
  path.join(__dirname, '..', 'shared', 'remote-types.ts'),
  path.join(__dirname, '..', '..', 'shared', 'remote-types.ts'),
  path.join(process.cwd(), 'shared', 'remote-types.ts'),
];

function readFirstExistingFile(paths) {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8');
    }
  }
  return null;
}

function extractMutationPath(typesSource, mutationConstName) {
  const pattern = new RegExp(
    `export const ${mutationConstName}\\s*=\\s*defineMutation[\\s\\S]*?\\(\\s*'[^']*'\\s*,\\s*'([^']+)'\\s*\\)`,
    'm'
  );
  const match = typesSource.match(pattern);
  return match ? match[1] : null;
}

function extractStringConstant(typesSource, constName) {
  const pattern = new RegExp(
    `export const ${constName}\\s*=\\s*'([^']+)'\\s*;`,
    'm'
  );
  const match = typesSource.match(pattern);
  return match ? match[1] : null;
}

function loadRemotePaths() {
  const fallback = {
    organizations: '/v1/organizations',
    projects: '/v1/projects',
    projectStatuses: '/v1/project_statuses',
    issues: '/v1/issues',
  };

  const typesSource = readFirstExistingFile(REMOTE_TYPES_FILE_CANDIDATES);
  if (!typesSource) {
    return fallback;
  }

  return {
    organizations:
      extractStringConstant(typesSource, 'ORGANIZATIONS_ENDPOINT') ||
      fallback.organizations,
    projects:
      extractMutationPath(typesSource, 'PROJECT_MUTATION') || fallback.projects,
    projectStatuses:
      extractMutationPath(typesSource, 'PROJECT_STATUS_MUTATION') ||
      fallback.projectStatuses,
    issues: extractMutationPath(typesSource, 'ISSUE_MUTATION') || fallback.issues,
  };
}

const PATHS = loadRemotePaths();

function resolveBackendUrl() {
  const explicit = process.env.VIBE_BACKEND_URL;
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim().replace(/\/$/, '');
  }

  const host =
    (process.env.MCP_HOST || process.env.HOST || '127.0.0.1').trim() ||
    '127.0.0.1';

  const envPort =
    process.env.MCP_PORT || process.env.BACKEND_PORT || process.env.PORT;
  const parsedEnvPort = Number.parseInt(envPort || '', 10);
  if (Number.isInteger(parsedEnvPort) && parsedEnvPort > 0) {
    return `http://${host}:${parsedEnvPort}`;
  }

  const portFile = path.join(os.tmpdir(), 'vibe-kanban', 'vibe-kanban.port');
  const rawPort = fs.readFileSync(portFile, 'utf8').trim();
  const filePort = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(filePort) || filePort <= 0) {
    throw new Error(`Invalid backend port in ${portFile}: '${rawPort}'`);
  }

  return `http://${host}:${filePort}`;
}

async function fetchAuthToken() {
  const backendBaseUrl = resolveBackendUrl();
  const url = `${backendBaseUrl}/api/auth/token`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to connect to local Vibe Kanban backend at ${backendBaseUrl}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401) {
    throw new Error('Not authenticated. Sign in to Vibe Kanban and try again.');
  }

  if (!response.ok) {
    const message = payload?.message || `HTTP ${response.status}`;
    throw new Error(`Failed to fetch auth token: ${message}`);
  }

  const token = payload?.data?.access_token;
  if (!token || typeof token !== 'string') {
    throw new Error('Auth token response did not include data.access_token');
  }

  return token;
}

function buildUrl(pathname, query) {
  const url = new URL(pathname, `${REMOTE_BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function remoteRequest(pathname, options = {}) {
  const token = await fetchAuthToken();
  const url = buildUrl(pathname, options.query);

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Client-Type': 'remote-mcp',
    'X-Client-Version': PACKAGE_VERSION,
    Accept: 'application/json',
  };

  let body = undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body,
  });

  const responseText = await response.text();
  let payload = null;
  if (responseText.length > 0) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      `Remote API request failed with ${response.status}`;
    throw new Error(message);
  }

  if (payload === null) {
    return {};
  }

  return payload;
}

function sortStatuses(statuses) {
  return [...statuses].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

async function getProjectStatuses(projectId) {
  const response = await remoteRequest(PATHS.projectStatuses, {
    query: { project_id: projectId },
  });
  const statuses = Array.isArray(response.project_statuses)
    ? response.project_statuses
    : [];
  return sortStatuses(statuses);
}

async function resolveStatusId(projectId, explicitStatusId, explicitStatusName) {
  if (explicitStatusId) return explicitStatusId;

  const statuses = await getProjectStatuses(projectId);

  if (explicitStatusName) {
    const match = statuses.find(
      (status) =>
        typeof status.name === 'string' &&
        status.name.toLowerCase() === explicitStatusName.toLowerCase()
    );
    if (!match) {
      const available = statuses
        .map((status) => status.name)
        .filter(Boolean)
        .join(', ');
      throw new Error(
        `Unknown status '${explicitStatusName}'. Available statuses: ${available || 'none'}`
      );
    }
    return match.id;
  }

  const defaultStatus = statuses.find((status) => !status.hidden) || statuses[0];
  if (!defaultStatus || !defaultStatus.id) {
    throw new Error('No available project status to assign to the issue');
  }

  return defaultStatus.id;
}

function requireString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required and must be a non-empty string`);
  }
  return value.trim();
}

async function handleToolCall(name, args) {
  switch (name) {
    case 'list_organizations': {
      const response = await remoteRequest(PATHS.organizations);
      return {
        organizations: Array.isArray(response.organizations)
          ? response.organizations
          : [],
      };
    }

    case 'list_projects': {
      const organizationId = requireString(args.organization_id, 'organization_id');
      const response = await remoteRequest(PATHS.projects, {
        query: { organization_id: organizationId },
      });
      return {
        projects: Array.isArray(response.projects) ? response.projects : [],
      };
    }

    case 'list_project_statuses': {
      const projectId = requireString(args.project_id, 'project_id');
      const statuses = await getProjectStatuses(projectId);
      return { project_statuses: statuses };
    }

    case 'list_issues': {
      const projectId = requireString(args.project_id, 'project_id');
      const limit =
        typeof args.limit === 'number' && Number.isFinite(args.limit)
          ? Math.max(0, Math.floor(args.limit))
          : 50;

      const response = await remoteRequest(PATHS.issues, {
        query: { project_id: projectId },
      });
      const issues = Array.isArray(response.issues) ? response.issues : [];
      return {
        issues: issues.slice(0, limit),
        total_count: issues.length,
      };
    }

    case 'get_issue': {
      const issueId = requireString(args.issue_id, 'issue_id');
      const issue = await remoteRequest(`${PATHS.issues}/${issueId}`);
      return { issue };
    }

    case 'create_issue': {
      const projectId = requireString(args.project_id, 'project_id');
      const title = requireString(args.title, 'title');

      const statusId = await resolveStatusId(
        projectId,
        args.status_id,
        args.status
      );

      const payload = {
        project_id: projectId,
        status_id: statusId,
        title,
        description:
          args.description === undefined ? null : args.description,
        priority: null,
        start_date: null,
        target_date: null,
        completed_at: null,
        sort_order: 0,
        parent_issue_id: null,
        parent_issue_sort_order: null,
        extension_metadata: {},
      };

      const response = await remoteRequest(PATHS.issues, {
        method: 'POST',
        body: payload,
      });

      return {
        issue: response.data,
        txid: response.txid,
      };
    }

    case 'update_issue': {
      const issueId = requireString(args.issue_id, 'issue_id');
      const updatePayload = {};

      if (args.title !== undefined) updatePayload.title = args.title;
      if (args.description !== undefined) {
        updatePayload.description = args.description;
      }
      if (args.priority !== undefined) updatePayload.priority = args.priority;
      if (args.start_date !== undefined) updatePayload.start_date = args.start_date;
      if (args.target_date !== undefined) {
        updatePayload.target_date = args.target_date;
      }
      if (args.completed_at !== undefined) {
        updatePayload.completed_at = args.completed_at;
      }

      if (args.status !== undefined || args.status_id !== undefined) {
        const existingIssue = await remoteRequest(`${PATHS.issues}/${issueId}`);
        const statusId = await resolveStatusId(
          existingIssue.project_id,
          args.status_id,
          args.status
        );
        updatePayload.status_id = statusId;
      }

      if (Object.keys(updatePayload).length === 0) {
        throw new Error('No fields provided for update');
      }

      const response = await remoteRequest(`${PATHS.issues}/${issueId}`, {
        method: 'PATCH',
        body: updatePayload,
      });

      return {
        issue: response.data,
        txid: response.txid,
      };
    }

    case 'delete_issue': {
      const issueId = requireString(args.issue_id, 'issue_id');
      const response = await remoteRequest(`${PATHS.issues}/${issueId}`, {
        method: 'DELETE',
      });
      return {
        deleted_issue_id: issueId,
        txid: response.txid,
      };
    }

    default:
      throw new Error(`Unknown tool '${name}'`);
  }
}

const TOOL_DEFINITIONS = [
  {
    name: 'list_organizations',
    description: 'List organizations for the authenticated Vibe Kanban user.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'list_projects',
    description: 'List projects for an organization.',
    inputSchema: {
      type: 'object',
      properties: {
        organization_id: {
          type: 'string',
          description: 'Organization UUID.',
        },
      },
      required: ['organization_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_project_statuses',
    description: 'List statuses for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'Project UUID.',
        },
      },
      required: ['project_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_issues',
    description: 'List issues for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'Project UUID.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of issues to return (default: 50).',
        },
      },
      required: ['project_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_issue',
    description: 'Fetch one issue by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        issue_id: {
          type: 'string',
          description: 'Issue UUID.',
        },
      },
      required: ['issue_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_issue',
    description:
      'Create an issue in a project. If status is omitted, the first visible project status is used.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'Project UUID.',
        },
        title: {
          type: 'string',
          description: 'Issue title.',
        },
        description: {
          type: ['string', 'null'],
          description: 'Issue description.',
        },
        status: {
          type: 'string',
          description: 'Optional status name.',
        },
        status_id: {
          type: 'string',
          description: 'Optional explicit status UUID.',
        },
      },
      required: ['project_id', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_issue',
    description: 'Update issue fields.',
    inputSchema: {
      type: 'object',
      properties: {
        issue_id: {
          type: 'string',
          description: 'Issue UUID.',
        },
        title: {
          type: 'string',
          description: 'New title.',
        },
        description: {
          type: ['string', 'null'],
          description: 'New description.',
        },
        status: {
          type: 'string',
          description: 'Optional new status name.',
        },
        status_id: {
          type: 'string',
          description: 'Optional new status UUID.',
        },
        priority: {
          type: ['string', 'null'],
          description: 'Priority value.',
        },
        start_date: {
          type: ['string', 'null'],
          description: 'Start date (ISO string) or null.',
        },
        target_date: {
          type: ['string', 'null'],
          description: 'Target date (ISO string) or null.',
        },
        completed_at: {
          type: ['string', 'null'],
          description: 'Completion timestamp (ISO string) or null.',
        },
      },
      required: ['issue_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_issue',
    description: 'Delete an issue by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        issue_id: {
          type: 'string',
          description: 'Issue UUID.',
        },
      },
      required: ['issue_id'],
      additionalProperties: false,
    },
  },
];

function createToolResult(payload, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    isError,
  };
}

function sendMessage(message) {
  const json = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n`;
  process.stdout.write(header + json);
}

function sendResponse(id, result) {
  sendMessage({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function sendJsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }

  sendMessage({
    jsonrpc: '2.0',
    id,
    error,
  });
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === 'initialize') {
    sendResponse(id, {
      protocolVersion: '2025-03-26',
      capabilities: {
        tools: {},
      },
      serverInfo: SERVER_INFO,
      instructions:
        'Vibe Kanban remote issue server. Use these tools to manage cloud issues via remote API.',
    });
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'ping') {
    sendResponse(id, {});
    return;
  }

  if (method === 'tools/list') {
    sendResponse(id, { tools: TOOL_DEFINITIONS });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};

    if (typeof toolName !== 'string' || toolName.length === 0) {
      sendResponse(
        id,
        createToolResult({ error: 'Tool name is required' }, true)
      );
      return;
    }

    try {
      const result = await handleToolCall(toolName, toolArgs);
      sendResponse(id, createToolResult(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendResponse(id, createToolResult({ error: message }, true));
    }

    return;
  }

  if (id !== undefined) {
    sendJsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = Buffer.alloc(0);

function processBuffer() {
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const headerText = buffer.slice(0, headerEnd).toString('utf8');
    const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = Number.parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;

    if (buffer.length < bodyEnd) {
      return;
    }

    const bodyText = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);

    let message;
    try {
      message = JSON.parse(bodyText);
    } catch (error) {
      sendJsonRpcError(
        null,
        -32700,
        'Parse error',
        error instanceof Error ? error.message : String(error)
      );
      continue;
    }

    void handleRequest(message).catch((error) => {
      if (message && message.id !== undefined) {
        sendJsonRpcError(
          message.id,
          -32603,
          'Internal error',
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  processBuffer();
});

process.stdin.on('error', (error) => {
  process.stderr.write(`[remote-mcp] stdin error: ${error.message}\n`);
});

process.on('uncaughtException', (error) => {
  process.stderr.write(`[remote-mcp] uncaught exception: ${error.message}\n`);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  process.stderr.write(`[remote-mcp] unhandled rejection: ${msg}\n`);
});
