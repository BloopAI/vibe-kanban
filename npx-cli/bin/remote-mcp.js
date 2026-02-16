#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const REMOTE_BASE_URL = (process.env.VK_SHARED_API_BASE || 'https://api.vibekanban.com').replace(/\/$/, '');
const PACKAGE_VERSION = (() => {
    try {
        const pkgPath = path.join(__dirname, '..', 'package.json');
        return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || 'unknown';
    }
    catch {
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
const FALLBACK_MANIFEST = {
    mutations: [],
    shapesByTable: new Map(),
};
function readFirstExistingFile(paths) {
    for (const candidate of paths) {
        if (fs.existsSync(candidate)) {
            return fs.readFileSync(candidate, 'utf8');
        }
    }
    return null;
}
function parseShapeDefinitions(typesSource) {
    const shapes = [];
    const shapeRegex = /export const (\w+)\s*=\s*defineShape<([\s\S]*?)>\(\s*'([^']+)'\s*,\s*\[([\s\S]*?)\]\s*as const\s*,\s*'([^']+)'\s*\);/gm;
    let match;
    while ((match = shapeRegex.exec(typesSource)) !== null) {
        const paramsRaw = match[4] || '';
        const params = [];
        const paramRegex = /'([^']+)'/g;
        let paramMatch;
        while ((paramMatch = paramRegex.exec(paramsRaw)) !== null) {
            params.push(paramMatch[1]);
        }
        shapes.push({
            constName: match[1],
            rowType: match[2].trim(),
            table: match[3],
            params,
            url: match[5],
        });
    }
    return shapes;
}
function parseMutationDefinitions(typesSource) {
    const mutations = [];
    const mutationRegex = /export const (\w+)_MUTATION\s*=\s*defineMutation<([\s\S]*?)>\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\);/gm;
    let match;
    while ((match = mutationRegex.exec(typesSource)) !== null) {
        const genericTypes = match[2]
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
        mutations.push({
            constName: match[1],
            rowType: genericTypes[0] || match[3],
            displayName: match[3],
            url: match[4],
        });
    }
    return mutations;
}
function extractTableFromMutationUrl(urlPath) {
    const parts = String(urlPath)
        .split('/')
        .filter(Boolean);
    if (parts.length !== 2 || parts[0] !== 'v1') {
        return null;
    }
    return parts[1];
}
function singularize(word) {
    if (word.endsWith('ies')) {
        return `${word.slice(0, -3)}y`;
    }
    if (word.endsWith('ses')) {
        return word.slice(0, -2);
    }
    if (word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }
    return word;
}
function prettyName(name) {
    return name
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
function shapeSortKey(shape) {
    const params = Array.isArray(shape?.params) ? shape.params : [];
    return [params.length, [...params].sort().join(','), shape.constName || ''].join('|');
}
function buildManifestFromTypes(typesSource) {
    const parsedShapes = parseShapeDefinitions(typesSource);
    const parsedMutations = parseMutationDefinitions(typesSource);
    const shapesByTable = new Map();
    for (const shape of parsedShapes) {
        const existing = shapesByTable.get(shape.table) || [];
        existing.push({
            constName: shape.constName,
            rowType: shape.rowType,
            params: shape.params,
            url: shape.url,
        });
        shapesByTable.set(shape.table, existing);
    }
    const mutations = [];
    for (const mutation of parsedMutations) {
        const table = extractTableFromMutationUrl(mutation.url);
        if (!table) {
            continue;
        }
        mutations.push({
            table,
            rowType: mutation.rowType,
            displayName: mutation.displayName,
            url: mutation.url,
            singular: singularize(table),
            idField: `${singularize(table)}_id`,
        });
    }
    return {
        mutations,
        shapesByTable,
    };
}
function loadRemoteManifest() {
    const typesSource = readFirstExistingFile(REMOTE_TYPES_FILE_CANDIDATES);
    if (!typesSource) {
        return FALLBACK_MANIFEST;
    }
    const manifest = buildManifestFromTypes(typesSource);
    if (manifest.mutations.length === 0) {
        return FALLBACK_MANIFEST;
    }
    return manifest;
}
const MANIFEST = loadRemoteManifest();
function resolveBackendUrl() {
    const explicit = process.env.VIBE_BACKEND_URL;
    if (explicit && explicit.trim().length > 0) {
        return explicit.trim().replace(/\/$/, '');
    }
    const host = (process.env.MCP_HOST || process.env.HOST || '127.0.0.1').trim() ||
        '127.0.0.1';
    const envPort = process.env.MCP_PORT || process.env.BACKEND_PORT || process.env.PORT;
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
    }
    catch (error) {
        throw new Error(`Failed to connect to local Vibe Kanban backend at ${backendBaseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
    let payload = null;
    try {
        payload = await response.json();
    }
    catch {
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
            if (value === undefined || value === null || value === '')
                continue;
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
        }
        catch {
            payload = null;
        }
    }
    if (!response.ok) {
        const message = payload?.error ||
            payload?.message ||
            `Remote API request failed with ${response.status}`;
        throw new Error(message);
    }
    if (payload === null) {
        return {};
    }
    return payload;
}
function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} is required and must be a non-empty string`);
    }
    return value.trim();
}
function requireObject(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${fieldName} must be an object`);
    }
    return value;
}
function pickListShape(table) {
    const shapes = MANIFEST.shapesByTable.get(table) || [];
    if (shapes.length === 0) {
        return null;
    }
    return [...shapes].sort((a, b) => shapeSortKey(a).localeCompare(shapeSortKey(b)))[0];
}
function buildGeneratedCrudTools() {
    const tools = [];
    for (const mutation of MANIFEST.mutations) {
        const shape = pickListShape(mutation.table);
        const listParams = shape?.params || [];
        const listToolName = `list_${mutation.table}`;
        const getToolName = `get_${mutation.singular}`;
        const createToolName = `create_${mutation.singular}`;
        const updateToolName = `update_${mutation.singular}`;
        const deleteToolName = `delete_${mutation.singular}`;
        const listProperties = {};
        for (const param of listParams) {
            listProperties[param] = {
                type: 'string',
                description: `${param} filter`,
            };
        }
        listProperties.limit = {
            type: 'number',
            description: 'Optional maximum number of rows to return.',
        };
        tools.push({
            definition: {
                name: listToolName,
                description: `List ${prettyName(mutation.table)} rows.`,
                inputSchema: {
                    type: 'object',
                    properties: listProperties,
                    required: listParams,
                    additionalProperties: false,
                },
            },
            handler: async (args) => {
                const query = {};
                for (const param of listParams) {
                    query[param] = requireString(args[param], param);
                }
                const response = await remoteRequest(mutation.url, { query });
                const rows = Array.isArray(response[mutation.table])
                    ? response[mutation.table]
                    : [];
                const limit = typeof args.limit === 'number' && Number.isFinite(args.limit)
                    ? Math.max(0, Math.floor(args.limit))
                    : rows.length;
                return {
                    [mutation.table]: rows.slice(0, limit),
                    total_count: rows.length,
                };
            },
        });
        tools.push({
            definition: {
                name: getToolName,
                description: `Get one ${prettyName(mutation.singular)} by ID.`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        [mutation.idField]: {
                            type: 'string',
                            description: `${mutation.idField} UUID`,
                        },
                    },
                    required: [mutation.idField],
                    additionalProperties: false,
                },
            },
            handler: async (args) => {
                const rowId = requireString(args[mutation.idField], mutation.idField);
                const row = await remoteRequest(`${mutation.url}/${rowId}`);
                return {
                    [mutation.singular]: row,
                };
            },
        });
        tools.push({
            definition: {
                name: createToolName,
                description: `Create a new ${prettyName(mutation.singular)}.`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        data: {
                            type: 'object',
                            description: 'Create payload sent directly to the remote API.',
                        },
                    },
                    required: ['data'],
                    additionalProperties: false,
                },
            },
            handler: async (args) => {
                const data = requireObject(args.data, 'data');
                const response = await remoteRequest(mutation.url, {
                    method: 'POST',
                    body: data,
                });
                if (response &&
                    typeof response === 'object' &&
                    response.data !== undefined) {
                    return {
                        [mutation.singular]: response.data,
                        txid: response.txid,
                    };
                }
                return response;
            },
        });
        tools.push({
            definition: {
                name: updateToolName,
                description: `Update an existing ${prettyName(mutation.singular)}.`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        [mutation.idField]: {
                            type: 'string',
                            description: `${mutation.idField} UUID`,
                        },
                        data: {
                            type: 'object',
                            description: 'Patch payload sent directly to the remote API.',
                        },
                    },
                    required: [mutation.idField, 'data'],
                    additionalProperties: false,
                },
            },
            handler: async (args) => {
                const rowId = requireString(args[mutation.idField], mutation.idField);
                const data = requireObject(args.data, 'data');
                const response = await remoteRequest(`${mutation.url}/${rowId}`, {
                    method: 'PATCH',
                    body: data,
                });
                if (response &&
                    typeof response === 'object' &&
                    response.data !== undefined) {
                    return {
                        [mutation.singular]: response.data,
                        txid: response.txid,
                    };
                }
                return response;
            },
        });
        tools.push({
            definition: {
                name: deleteToolName,
                description: `Delete an existing ${prettyName(mutation.singular)}.`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        [mutation.idField]: {
                            type: 'string',
                            description: `${mutation.idField} UUID`,
                        },
                    },
                    required: [mutation.idField],
                    additionalProperties: false,
                },
            },
            handler: async (args) => {
                const rowId = requireString(args[mutation.idField], mutation.idField);
                const response = await remoteRequest(`${mutation.url}/${rowId}`, {
                    method: 'DELETE',
                });
                return {
                    deleted_id: rowId,
                    txid: response.txid,
                };
            },
        });
    }
    return tools;
}
function buildToolRegistry() {
    const registry = new Map();
    for (const entry of buildGeneratedCrudTools()) {
        registry.set(entry.definition.name, entry);
    }
    return registry;
}
const TOOL_REGISTRY = buildToolRegistry();
const TOOL_DEFINITIONS = [...TOOL_REGISTRY.values()]
    .map((entry) => entry.definition)
    .sort((a, b) => a.name.localeCompare(b.name));
async function handleToolCall(name, args) {
    const entry = TOOL_REGISTRY.get(name);
    if (!entry) {
        throw new Error(`Unknown tool '${name}'`);
    }
    return entry.handler(args || {});
}
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
            instructions: 'Vibe Kanban remote server. Tools are auto-generated from shared/remote-types.ts mutations and shapes.',
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
            sendResponse(id, createToolResult({ error: 'Tool name is required' }, true));
            return;
        }
        try {
            const result = await handleToolCall(toolName, toolArgs);
            sendResponse(id, createToolResult(result));
        }
        catch (error) {
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
        }
        catch (error) {
            sendJsonRpcError(null, -32700, 'Parse error', error instanceof Error ? error.message : String(error));
            continue;
        }
        void handleRequest(message).catch((error) => {
            if (message && message.id !== undefined) {
                sendJsonRpcError(message.id, -32603, 'Internal error', error instanceof Error ? error.message : String(error));
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
