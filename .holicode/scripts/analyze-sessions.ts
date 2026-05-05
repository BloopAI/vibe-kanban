#!/usr/bin/env npx tsx
/**
 * Session Telemetry: Passive Batch Skeleton Extractor
 *
 * Extracts session metadata from Claude Code JSONL and OpenCode file storage
 * into unified SessionSkeleton YAML files for cross-session analysis.
 *
 * Usage:
 *   npx tsx scripts/analyze-sessions.ts [--runtime claude_code|opencode|all] [--since DATE] [--output-dir PATH]
 *
 * Design: TD-session-telemetry.md (HOL-53)
 */

import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { basename, join } from "node:path";

// ─── Types ───────────────────────────────────────────────────────

type Runtime = "claude_code" | "opencode";

type ToolCategory =
  | "file_read"
  | "file_write"
  | "search"
  | "shell"
  | "mcp_board"
  | "mcp_workspace"
  | "subagent"
  | "progress"
  | "skill"
  | "other";

type Archetype =
  | "quick_admin"
  | "implementation"
  | "planning"
  | "orchestrator"
  | "spike"
  | "unknown";

type Phase = "boot" | "explore" | "implement" | "test" | "board_ops" | "dispatch" | "commit" | "close";

interface ToolEvent {
  ts: string;
  turn: number;
  tool: string;
  cat: ToolCategory;
  is_parallel: boolean;
  is_subagent: boolean;
  skill_name?: string;
  subagent_type?: string;
}

interface SessionEvent {
  session_id: string;
  runtime: Runtime;
  workspace_id: string | null;
  issue_id: string | null;
  branch: string | null;
  archetype: Archetype;
  agent_setting: string | null;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  user_turns: number;
  total_tool_calls: number;
  compaction_count: number;
  subagent_count: number;
  workspace_dispatches: number;
  model: string;
  file_size_bytes: number;
  pr_urls: string[];
}

interface PhaseEvent {
  phase: Phase;
  start: string;
  end: string;
  tools: number;
  dominant: string;
}

interface SessionSkeleton {
  session: SessionEvent;
  tools: ToolEvent[];
  phases: PhaseEvent[];
  toolSummary: Record<string, number>;
}

interface Extractor {
  discoverSessions(since?: Date): Promise<string[]>;
  extractSkeleton(sessionRef: string): Promise<SessionSkeleton | null>;
}

// ─── Tool Name Normalization ─────────────────────────────────────

const TOOL_ALIASES: Record<string, string> = {
  // OpenCode lowercase → canonical PascalCase
  bash: "Bash",
  read: "Read",
  write: "Write",
  edit: "Edit",
  glob: "Glob",
  grep: "Grep",
  fetch: "WebFetch",
  webfetch: "WebFetch",
  websearch: "WebSearch",
  task: "Task",
  todowrite: "TodoWrite",
  skill: "Skill",
  notebookedit: "NotebookEdit",
  taskoutput: "TaskOutput",
  taskstop: "TaskStop",
  enterplanmode: "EnterPlanMode",
  exitplanmode: "ExitPlanMode",
};

function normalizeToolName(name: string, runtime: Runtime): string {
  if (runtime === "opencode") {
    // OpenCode MCP tools use single underscores: vibe_kanban_get_issue
    // Normalize to Claude Code convention: mcp__vibe_kanban__get_issue
    if (name.startsWith("vibe_kanban_")) {
      return "mcp__vibe_kanban__" + name.slice("vibe_kanban_".length);
    }
    return TOOL_ALIASES[name] ?? name;
  }
  return name;
}

// ─── Tool Categorization ─────────────────────────────────────────

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  Read: "file_read",
  Glob: "search",
  Grep: "search",
  Edit: "file_write",
  Write: "file_write",
  NotebookEdit: "file_write",
  Bash: "shell",
  Task: "subagent",
  TaskOutput: "subagent",
  TaskStop: "subagent",
  TodoWrite: "progress",
  Skill: "skill",
  WebFetch: "other",
  WebSearch: "other",
  EnterPlanMode: "other",
  ExitPlanMode: "other",
};

const MCP_WORKSPACE_SUFFIXES = new Set([
  "start_workspace_session",
  "list_workspaces",
  "delete_workspace",
  "update_workspace",
  "link_workspace",
]);

function categorizeTool(name: string): ToolCategory {
  if (name in TOOL_CATEGORIES) return TOOL_CATEGORIES[name];
  if (name.startsWith("mcp__vibe_kanban__")) {
    const suffix = name.slice("mcp__vibe_kanban__".length);
    return MCP_WORKSPACE_SUFFIXES.has(suffix) ? "mcp_workspace" : "mcp_board";
  }
  return "other";
}

// ─── Archetype Classification ────────────────────────────────────

function classifyArchetype(
  toolCounts: Record<string, number>,
  total: number,
  fileSize: number,
): Archetype {
  const sumByCategory = (cat: ToolCategory) =>
    Object.entries(toolCounts).reduce(
      (s, [k, v]) => s + (categorizeTool(k) === cat ? v : 0),
      0,
    );

  const mcpBoard = sumByCategory("mcp_board");
  const fileWrite = sumByCategory("file_write");
  const dispatches = toolCounts["mcp__vibe_kanban__start_workspace_session"] ?? 0;
  const subagents = (toolCounts["Task"] ?? 0) + (toolCounts["task"] ?? 0);
  const search = sumByCategory("search");

  if (fileSize < 100_000 && mcpBoard / Math.max(total, 1) > 0.4) return "quick_admin";
  if (dispatches >= 2) return "orchestrator";
  if (fileWrite / Math.max(total, 1) > 0.15) return "implementation";
  if (subagents >= 3 || search / Math.max(total, 1) > 0.3) return "spike";
  if (total > 20) return "planning";
  return "unknown";
}

// ─── Phase Detection ─────────────────────────────────────────────

function detectPhases(tools: ToolEvent[]): PhaseEvent[] {
  if (tools.length === 0) return [];

  const phases: PhaseEvent[] = [];
  let currentPhase: Phase | null = null;
  let phaseStart = "";
  let phaseTools: string[] = [];

  function flushPhase(endTs: string) {
    if (currentPhase && phaseTools.length > 0) {
      const counts: Record<string, number> = {};
      for (const t of phaseTools) counts[t] = (counts[t] || 0) + 1;
      const dominant = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "";
      phases.push({
        phase: currentPhase,
        start: phaseStart,
        end: endTs,
        tools: phaseTools.length,
        dominant,
      });
    }
  }

  function classifyPhase(tool: ToolEvent): Phase {
    const cat = tool.cat;
    const name = tool.tool;

    // Bash with test/git patterns
    if (name === "Bash") {
      // We don't have command content in skeleton, so classify as shell context
      return "implement"; // Bash during implementation is most common
    }

    if (name === "mcp__vibe_kanban__start_workspace_session") return "dispatch";
    if (cat === "mcp_board" || cat === "mcp_workspace") return "board_ops";
    if (cat === "file_write") return "implement";
    if (cat === "subagent" || cat === "search") return "explore";
    if (cat === "file_read") return "explore";
    if (cat === "progress") return "implement";
    if (cat === "skill") return "implement";

    return "implement";
  }

  // Boot phase: first tools until first non-Read/non-MCP-read tool
  let bootEnd = 0;
  for (let i = 0; i < tools.length; i++) {
    const cat = tools[i].cat;
    if (cat !== "file_read" && cat !== "mcp_board" && cat !== "mcp_workspace" && cat !== "search") {
      bootEnd = i;
      break;
    }
    if (i >= 15) { // Safety cap: boot phase never > 15 tools
      bootEnd = i;
      break;
    }
  }

  if (bootEnd > 0) {
    const bootTools = tools.slice(0, bootEnd).map((t) => t.tool);
    const counts: Record<string, number> = {};
    for (const t of bootTools) counts[t] = (counts[t] || 0) + 1;
    const dominant = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "";
    phases.push({
      phase: "boot",
      start: tools[0].ts,
      end: tools[bootEnd - 1].ts,
      tools: bootEnd,
      dominant,
    });
  }

  // Remaining tools: classify into phases by consecutive tool category
  for (let i = bootEnd; i < tools.length; i++) {
    const phase = classifyPhase(tools[i]);
    if (phase !== currentPhase) {
      flushPhase(i > 0 ? tools[i - 1].ts : tools[i].ts);
      currentPhase = phase;
      phaseStart = tools[i].ts;
      phaseTools = [];
    }
    phaseTools.push(tools[i].tool);
  }
  // Flush final phase
  flushPhase(tools[tools.length - 1].ts);

  return phases;
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Extract text from a tool_result content block (string or array of text items) */
function extractToolResultText(block: any): string {
  const rc = block.content;
  if (typeof rc === "string") return rc;
  if (Array.isArray(rc)) {
    return rc
      .filter((item: any) => item.type === "text" && item.text)
      .map((item: any) => item.text)
      .join("");
  }
  return "";
}

// ─── Claude Code Extractor ───────────────────────────────────────

class ClaudeCodeExtractor implements Extractor {
  private projectsDir: string;

  constructor() {
    this.projectsDir = join(homedir(), ".claude", "projects");
  }

  async discoverSessions(since?: Date): Promise<string[]> {
    const sessions: string[] = [];
    if (!existsSync(this.projectsDir)) return sessions;

    const projectDirs = readdirSync(this.projectsDir);
    for (const dir of projectDirs) {
      const dirPath = join(this.projectsDir, dir);
      const dirStat = statSync(dirPath);
      if (!dirStat.isDirectory()) continue;

      const files = readdirSync(dirPath);
      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        // Skip subagent files at discovery level
        if (file.startsWith("agent-")) continue;

        const filePath = join(dirPath, file);
        if (since) {
          const fileStat = statSync(filePath);
          if (fileStat.mtime < since) continue;
        }
        sessions.push(filePath);
      }
    }

    return sessions;
  }

  async extractSkeleton(jsonlPath: string): Promise<SessionSkeleton | null> {
    const fileStats = await stat(jsonlPath);
    if (fileStats.size === 0) return null;

    const toolEvents: ToolEvent[] = [];
    const toolCounts: Record<string, number> = {};
    let firstTs = "";
    let lastTs = "";
    let userTurns = 0;
    let compactions = 0;
    let subagentCount = 0;
    let workspaceDispatches = 0;
    let model = "unknown";
    let branch: string | null = null;
    let sessionId = "";
    let agentSetting: string | null = null;
    let workspaceId: string | null = null;
    let issueId: string | null = null;
    let issueSimpleId: string | null = null; // HOL-xxx format, preferred over UUID
    const prUrls: string[] = [];
    // Track tool_use_ids for MCP tools whose results we want to parse
    const pendingContextIds = new Set<string>();
    const pendingGetIssueIds = new Set<string>();

    const rl = createInterface({
      input: createReadStream(jsonlPath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      const ts = msg.timestamp || "";
      const msgType = msg.type || "";

      if (!firstTs && ts) firstTs = ts;
      if (ts) lastTs = ts;

      if (!sessionId && msg.sessionId) sessionId = msg.sessionId;

      switch (msgType) {
        case "queue-operation":
          if (msg.operation === "dequeue") userTurns++;
          break;

        case "agent-setting":
          if (msg.agentSetting) agentSetting = msg.agentSetting;
          break;

        case "system":
          if (msg.subtype === "compact_boundary") compactions++;
          break;

        case "pr-link":
          if (msg.prUrl) prUrls.push(msg.prUrl);
          break;

        case "assistant": {
          if (!branch && msg.gitBranch) branch = msg.gitBranch;
          if (model === "unknown" && msg.message?.model) model = msg.message.model;

          const content = msg.message?.content;
          if (!Array.isArray(content)) break;

          const toolUses = content.filter((c: any) => c.type === "tool_use");
          const isParallel = toolUses.length > 1;
          const isSidechain = msg.isSidechain === true;

          for (const tu of toolUses) {
            const toolName = tu.name as string;
            const normalized = normalizeToolName(toolName, "claude_code");
            toolCounts[normalized] = (toolCounts[normalized] || 0) + 1;

            if (normalized === "Task") subagentCount++;
            if (normalized === "mcp__vibe_kanban__start_workspace_session") workspaceDispatches++;

            // Track MCP tool_use_ids so we can parse their results from user messages
            if (normalized === "mcp__vibe_kanban__get_context" && tu.id) {
              pendingContextIds.add(tu.id);
            }
            // Any issue-related MCP tool (except get_context) may return simple_id
            if (tu.id && normalized.startsWith("mcp__vibe_kanban__") &&
              normalized.includes("_issue")) {
              pendingGetIssueIds.add(tu.id);
            }

            // Capture UUID issue_id from MCP tool inputs as last-resort fallback
            if (!issueId && tu.input?.issue_id) {
              issueId = tu.input.issue_id;
            }

            // Enrichment: extract skill_name and subagent_type from tool inputs
            const skillName = normalized === "Skill" && tu.input?.skill
              ? String(tu.input.skill)
              : undefined;
            const subagentType = normalized === "Task" && tu.input?.subagent_type
              ? String(tu.input.subagent_type)
              : undefined;

            toolEvents.push({
              ts,
              turn: userTurns,
              tool: normalized,
              cat: categorizeTool(normalized),
              is_parallel: isParallel,
              is_subagent: isSidechain,
              skill_name: skillName,
              subagent_type: subagentType,
            });
          }
          break;
        }

        case "user": {
          // Extract data from tool_result content blocks (results of MCP tool calls)
          const userContent = msg.message?.content;
          if (!Array.isArray(userContent)) break;

          for (const block of userContent) {
            if (block.type !== "tool_result") continue;
            const tuId = block.tool_use_id;

            // Parse get_context result → workspace_id, issue_id (UUID)
            if (pendingContextIds.has(tuId)) {
              pendingContextIds.delete(tuId);
              try {
                const text = extractToolResultText(block);
                const parsed = JSON.parse(text);
                if (parsed.workspace_id && !workspaceId) workspaceId = parsed.workspace_id;
                if (parsed.issue_id && !issueId) issueId = parsed.issue_id;
              } catch {
                // Non-JSON or malformed — skip
              }
            }

            // Parse get_issue result → simple_id (HOL-xxx), always overrides UUID
            if (pendingGetIssueIds.has(tuId)) {
              pendingGetIssueIds.delete(tuId);
              try {
                const text = extractToolResultText(block);
                const parsed = JSON.parse(text);
                const simpleId = parsed.issue?.simple_id || parsed.simple_id;
                if (simpleId) issueSimpleId = simpleId;
              } catch {
                // Non-JSON — try regex fallback
                try {
                  const text = extractToolResultText(block);
                  const match = text.match(/"simple_id"\s*:\s*"([A-Z]+-\d+)"/);
                  if (match) issueSimpleId = match[1];
                } catch {}
              }
            }
          }
          break;
        }
      }
    }

    if (toolEvents.length === 0 && userTurns === 0) return null;

    // Process subagent files
    const sessionDir = jsonlPath.replace(".jsonl", "");
    const subagentsDir = join(sessionDir, "subagents");
    if (existsSync(subagentsDir)) {
      try {
        const subFiles = readdirSync(subagentsDir).filter((f) => f.endsWith(".jsonl"));
        for (const subFile of subFiles) {
          const subPath = join(subagentsDir, subFile);
          const subEvents = await this.extractSubagentTools(subPath, userTurns);
          for (const ev of subEvents) {
            toolEvents.push(ev);
            toolCounts[ev.tool] = (toolCounts[ev.tool] || 0) + 1;
          }
        }
      } catch {
        // Skip if subagents dir is unreadable
      }
    }

    // Re-sort tool events by timestamp after merging subagent events
    toolEvents.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

    const total = Object.values(toolCounts).reduce((a, b) => a + b, 0);
    const startDate = firstTs ? new Date(firstTs) : new Date();
    const endDate = lastTs ? new Date(lastTs) : new Date();
    const durationMin = (endDate.getTime() - startDate.getTime()) / 60000;

    return {
      session: {
        session_id: sessionId || basename(jsonlPath, ".jsonl"),
        runtime: "claude_code",
        workspace_id: workspaceId,
        issue_id: issueSimpleId || issueId, // prefer HOL-xxx over UUID
        branch,
        archetype: classifyArchetype(toolCounts, total, fileStats.size),
        agent_setting: agentSetting,
        started_at: firstTs || startDate.toISOString(),
        ended_at: lastTs || endDate.toISOString(),
        duration_minutes: Math.round(durationMin * 10) / 10,
        user_turns: userTurns,
        total_tool_calls: total,
        compaction_count: compactions,
        subagent_count: subagentCount,
        workspace_dispatches: workspaceDispatches,
        model,
        file_size_bytes: fileStats.size,
        pr_urls: prUrls,
      },
      tools: toolEvents,
      phases: detectPhases(toolEvents),
      toolSummary: toolCounts,
    };
  }

  private async extractSubagentTools(jsonlPath: string, parentTurn: number): Promise<ToolEvent[]> {
    const events: ToolEvent[] = [];
    const rl = createInterface({
      input: createReadStream(jsonlPath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      if (msg.type !== "assistant") continue;
      const content = msg.message?.content;
      if (!Array.isArray(content)) continue;

      const toolUses = content.filter((c: any) => c.type === "tool_use");
      const isParallel = toolUses.length > 1;

      for (const tu of toolUses) {
        const normalized = normalizeToolName(tu.name, "claude_code");
        events.push({
          ts: msg.timestamp || "",
          turn: parentTurn,
          tool: normalized,
          cat: categorizeTool(normalized),
          is_parallel: isParallel,
          is_subagent: true,
        });
      }
    }

    return events;
  }
}

// ─── OpenCode Extractor ──────────────────────────────────────────
//
// OpenCode uses a dual storage strategy:
//   1. JSON files under ~/.local/share/opencode/storage/ (primary, newer sessions)
//   2. SQLite DB at ~/.local/share/opencode/opencode.db (legacy sessions)
//
// Both sources are read; file storage is checked first, DB backfills
// any session IDs not found in file storage.
//
// File layout:
//   storage/session/{projectHash}/{sessionId}.json
//   storage/message/{sessionId}/{msgId}.json
//   storage/part/{msgId}/{partId}.json

interface OcSessionFile {
  id: string;
  slug: string;
  version: string;
  projectID: string;
  directory: string;
  title: string;
  time: { created: number; updated: number };
  summary?: { additions: number; deletions: number; files: number };
}

interface OcMessageFile {
  id: string;
  role: string;
  model?: { providerID: string; modelID: string };
  time: { created: number; completed?: number };
}

interface OcPartFile {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  tool?: string;
  callID?: string;
  input?: Record<string, unknown>;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/** Extract tool input from an OpenCode part, checking both state.input and top-level input */
function ocPartInput(part: { input?: Record<string, unknown>; state?: { input?: Record<string, unknown> } }): Record<string, unknown> | undefined {
  return part.state?.input ?? part.input;
}

/** Extract skill name from tool input — Claude Code uses "skill", OpenCode uses "name" */
function extractSkillName(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const name = input.skill ?? input.name;
  return name ? String(name) : undefined;
}

class OpenCodeExtractor implements Extractor {
  private storageDir: string;
  private dbPath: string;

  constructor() {
    const ocBase = join(homedir(), ".local", "share", "opencode");
    this.storageDir = join(ocBase, "storage");
    this.dbPath = join(ocBase, "opencode.db");
  }

  async discoverSessions(since?: Date): Promise<string[]> {
    const fileSessionIds = new Set<string>();

    // 1. Discover from file storage (primary)
    const sessionBaseDir = join(this.storageDir, "session");
    if (existsSync(sessionBaseDir)) {
      const projectDirs = readdirSync(sessionBaseDir);
      for (const projectHash of projectDirs) {
        const projectDir = join(sessionBaseDir, projectHash);
        if (!statSync(projectDir).isDirectory()) continue;

        const files = readdirSync(projectDir).filter((f) => f.endsWith(".json"));
        for (const file of files) {
          if (since) {
            try {
              const raw = require("node:fs").readFileSync(join(projectDir, file), "utf8");
              const sess: OcSessionFile = JSON.parse(raw);
              if (sess.time.created < since.getTime()) continue;
            } catch {
              continue;
            }
          }
          fileSessionIds.add(file.replace(".json", ""));
        }
      }
    }

    // 2. Backfill from SQLite DB (legacy sessions not in file storage)
    if (existsSync(this.dbPath)) {
      try {
        const db = new DatabaseSync(this.dbPath, { open: true });
        try {
          const rows = since
            ? db.prepare("SELECT id, time_created FROM session WHERE time_created >= ? ORDER BY time_created").all(since.getTime()) as Array<{ id: string; time_created: number }>
            : db.prepare("SELECT id, time_created FROM session ORDER BY time_created").all() as Array<{ id: string; time_created: number }>;
          for (const row of rows) {
            fileSessionIds.add(row.id); // Set deduplicates
          }
        } finally {
          db.close();
        }
      } catch {
        // DB may be locked or corrupt — skip gracefully
      }
    }

    return Array.from(fileSessionIds);
  }

  async extractSkeleton(sessionId: string): Promise<SessionSkeleton | null> {
    // Find session file across project directories
    const sessionBaseDir = join(this.storageDir, "session");
    let sessionData: OcSessionFile | null = null;

    if (existsSync(sessionBaseDir)) {
      const projectDirs = readdirSync(sessionBaseDir);
      for (const projectHash of projectDirs) {
        const sessionFile = join(sessionBaseDir, projectHash, `${sessionId}.json`);
        if (existsSync(sessionFile)) {
          const raw = require("node:fs").readFileSync(sessionFile, "utf8");
          sessionData = JSON.parse(raw);
          break;
        }
      }
    }

    if (!sessionData) {
      // Fall back to SQLite DB for legacy sessions or when file storage is absent
      return this.extractFromDb(sessionId);
    }

    // Read messages from storage/message/{sessionId}/
    const messageDir = join(this.storageDir, "message", sessionId);
    const messages: OcMessageFile[] = [];
    if (existsSync(messageDir)) {
      const msgFiles = readdirSync(messageDir).filter((f) => f.endsWith(".json")).sort();
      for (const mf of msgFiles) {
        try {
          const raw = require("node:fs").readFileSync(join(messageDir, mf), "utf8");
          messages.push(JSON.parse(raw));
        } catch {
          continue;
        }
      }
    }

    // Sort messages by time.created
    messages.sort((a, b) => a.time.created - b.time.created);

    // Single-pass: extract model + count user turns
    let model = "unknown";
    let userTurns = 0;
    for (const m of messages) {
      if (model === "unknown" && m.model?.modelID) model = m.model.modelID;
      if (m.role === "user") userTurns++;
    }

    // Read parts from storage/part/{msgId}/ for each message
    // Build a flat list of (part, messageId) ordered by message sequence
    const allParts: Array<{ part: OcPartFile; messageId: string; msgTime: number }> = [];
    const toolCountPerMessage = new Map<string, number>();

    for (const m of messages) {
      const partDir = join(this.storageDir, "part", m.id);
      if (!existsSync(partDir)) continue;

      const partFiles = readdirSync(partDir).filter((f) => f.endsWith(".json")).sort();
      for (const pf of partFiles) {
        try {
          const raw = require("node:fs").readFileSync(join(partDir, pf), "utf8");
          const part: OcPartFile = JSON.parse(raw);
          allParts.push({ part, messageId: m.id, msgTime: m.time.created });
          if (part.type === "tool") {
            toolCountPerMessage.set(m.id, (toolCountPerMessage.get(m.id) || 0) + 1);
          }
        } catch {
          continue;
        }
      }
    }

    // Extract tool events
    const toolEvents: ToolEvent[] = [];
    const toolCounts: Record<string, number> = {};
    let currentTurn = 0;

    for (const { part, messageId, msgTime } of allParts) {
      if (part.type === "step-start") {
        currentTurn++;
        continue;
      }

      if (part.type !== "tool" || !part.tool) continue;

      const normalized = normalizeToolName(part.tool, "opencode");
      toolCounts[normalized] = (toolCounts[normalized] || 0) + 1;

      const parallelCount = toolCountPerMessage.get(messageId) || 1;

      // Enrichment: extract skill_name and subagent_type from part inputs
      const partInput = ocPartInput(part);
      const skillName = normalized === "Skill"
        ? extractSkillName(partInput)
        : undefined;
      const subagentType = normalized === "Task" && partInput?.subagent_type
        ? String(partInput.subagent_type)
        : undefined;

      toolEvents.push({
        ts: new Date(msgTime).toISOString(),
        turn: currentTurn,
        tool: normalized,
        cat: categorizeTool(normalized),
        is_parallel: parallelCount > 1,
        is_subagent: false,
        skill_name: skillName,
        subagent_type: subagentType,
      });
    }

    const total = Object.values(toolCounts).reduce((a, b) => a + b, 0);

    // Estimate data size from message + part file count
    let dataSize = 0;
    if (existsSync(messageDir)) {
      for (const mf of readdirSync(messageDir)) {
        try { dataSize += statSync(join(messageDir, mf)).size; } catch {}
      }
    }
    for (const m of messages) {
      const partDir = join(this.storageDir, "part", m.id);
      if (existsSync(partDir)) {
        for (const pf of readdirSync(partDir)) {
          try { dataSize += statSync(join(partDir, pf)).size; } catch {}
        }
      }
    }

    const startedAt = new Date(sessionData.time.created).toISOString();
    const endedAt = new Date(sessionData.time.updated).toISOString();
    const durationMin = (sessionData.time.updated - sessionData.time.created) / 60000;
    const workspaceDispatches = toolCounts["mcp__vibe_kanban__start_workspace_session"] ?? 0;

    return {
      session: {
        session_id: sessionData.id,
        runtime: "opencode",
        workspace_id: null,
        issue_id: null,
        branch: null,
        archetype: classifyArchetype(toolCounts, total, dataSize),
        agent_setting: null,
        started_at: startedAt,
        ended_at: endedAt,
        duration_minutes: Math.round(durationMin * 10) / 10,
        user_turns: userTurns,
        total_tool_calls: total,
        compaction_count: 0,
        subagent_count: 0,
        workspace_dispatches: workspaceDispatches,
        model,
        file_size_bytes: dataSize,
        pr_urls: [],
      },
      tools: toolEvents,
      phases: detectPhases(toolEvents),
      toolSummary: toolCounts,
    };
  }

  /** Extract from SQLite DB for legacy sessions not in file storage */
  private extractFromDb(sessionId: string): SessionSkeleton | null {
    if (!existsSync(this.dbPath)) return null;

    const db = new DatabaseSync(this.dbPath, { open: true });
    try {
      const session = db
        .prepare("SELECT id, title, directory, time_created, time_updated, time_archived FROM session WHERE id = ?")
        .get(sessionId) as { id: string; title: string; directory: string; time_created: number; time_updated: number; time_archived: number | null } | undefined;

      if (!session) return null;

      const messages = db
        .prepare("SELECT id, session_id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created")
        .all(session.id) as Array<{ id: string; session_id: string; time_created: number; data: string }>;

      const parts = db
        .prepare("SELECT id, message_id, session_id, time_created, data FROM part WHERE session_id = ? ORDER BY time_created")
        .all(session.id) as Array<{ id: string; message_id: string; session_id: string; time_created: number; data: string }>;

      // Single-pass message processing
      let model = "unknown";
      let userTurns = 0;
      for (const m of messages) {
        const d = JSON.parse(m.data);
        if (model === "unknown" && d.model?.modelID) model = d.model.modelID;
        if (d.role === "user") userTurns++;
      }

      // Pre-compute parallel detection (O(P))
      const toolCountPerMessage = new Map<string, number>();
      const parsedParts: Array<{ messageId: string; time: number; data: any }> = [];
      for (const part of parts) {
        const d = JSON.parse(part.data);
        parsedParts.push({ messageId: part.message_id, time: part.time_created, data: d });
        if (d.type === "tool") {
          toolCountPerMessage.set(part.message_id, (toolCountPerMessage.get(part.message_id) || 0) + 1);
        }
      }

      const toolEvents: ToolEvent[] = [];
      const toolCounts: Record<string, number> = {};
      let currentTurn = 0;

      for (const { messageId, time, data: d } of parsedParts) {
        if (d.type === "step-start") { currentTurn++; continue; }
        if (d.type !== "tool") continue;

        const normalized = normalizeToolName(d.tool, "opencode");
        toolCounts[normalized] = (toolCounts[normalized] || 0) + 1;

        // Enrichment: extract skill_name and subagent_type from part data
        const dInput = ocPartInput(d);
        const skillName = normalized === "Skill"
          ? extractSkillName(dInput)
          : undefined;
        const subagentType = normalized === "Task" && dInput?.subagent_type
          ? String(dInput.subagent_type)
          : undefined;

        toolEvents.push({
          ts: new Date(time).toISOString(),
          turn: currentTurn,
          tool: normalized,
          cat: categorizeTool(normalized),
          is_parallel: (toolCountPerMessage.get(messageId) || 1) > 1,
          is_subagent: false,
          skill_name: skillName,
          subagent_type: subagentType,
        });
      }

      const total = Object.values(toolCounts).reduce((a, b) => a + b, 0);
      let dataSize = 0;
      for (const m of messages) dataSize += m.data.length;
      for (const p of parts) dataSize += p.data.length;

      return {
        session: {
          session_id: session.id,
          runtime: "opencode",
          workspace_id: null,
          issue_id: null,
          branch: null,
          archetype: classifyArchetype(toolCounts, total, dataSize),
          agent_setting: null,
          started_at: new Date(session.time_created).toISOString(),
          ended_at: new Date(session.time_updated).toISOString(),
          duration_minutes: Math.round((session.time_updated - session.time_created) / 60000 * 10) / 10,
          user_turns: userTurns,
          total_tool_calls: total,
          compaction_count: 0,
          subagent_count: 0,
          workspace_dispatches: toolCounts["mcp__vibe_kanban__start_workspace_session"] ?? 0,
          model,
          file_size_bytes: dataSize,
          pr_urls: [],
        },
        tools: toolEvents,
        phases: detectPhases(toolEvents),
        toolSummary: toolCounts,
      };
    } finally {
      db.close();
    }
  }
}

// ─── YAML Serializer ─────────────────────────────────────────────

function skeletonToYaml(skeleton: SessionSkeleton): string {
  const s = skeleton.session;
  const lines: string[] = [];

  lines.push("session:");
  lines.push(`  session_id: "${s.session_id}"`);
  lines.push(`  runtime: ${s.runtime}`);
  lines.push(`  workspace_id: ${s.workspace_id ? `"${s.workspace_id}"` : "null"}`);
  lines.push(`  issue_id: ${s.issue_id ? `"${s.issue_id}"` : "null"}`);
  lines.push(`  branch: ${s.branch ? `"${s.branch}"` : "null"}`);
  lines.push(`  archetype: ${s.archetype}`);
  lines.push(`  agent_setting: ${s.agent_setting ? `"${s.agent_setting}"` : "null"}`);
  lines.push(`  started_at: "${s.started_at}"`);
  lines.push(`  ended_at: "${s.ended_at}"`);
  lines.push(`  duration_minutes: ${s.duration_minutes.toFixed(1)}`);
  lines.push(`  user_turns: ${s.user_turns}`);
  lines.push(`  total_tool_calls: ${s.total_tool_calls}`);
  lines.push(`  compaction_count: ${s.compaction_count}`);
  lines.push(`  subagent_count: ${s.subagent_count}`);
  lines.push(`  workspace_dispatches: ${s.workspace_dispatches}`);
  lines.push(`  model: "${s.model}"`);
  lines.push(`  file_size_bytes: ${s.file_size_bytes}`);
  if (s.pr_urls.length > 0) {
    lines.push("  pr_urls:");
    for (const url of s.pr_urls) {
      lines.push(`    - "${url}"`);
    }
  } else {
    lines.push("  pr_urls: []");
  }

  lines.push("");
  lines.push("tools:");
  if (skeleton.tools.length === 0) {
    lines.push("  []");
  } else {
    for (const t of skeleton.tools) {
      let line = `  - {ts: "${t.ts}", turn: ${t.turn}, tool: "${t.tool}", cat: "${t.cat}"`;
      if (t.skill_name) line += `, skill_name: "${t.skill_name}"`;
      if (t.subagent_type) line += `, subagent_type: "${t.subagent_type}"`;
      line += "}";
      lines.push(line);
    }
  }

  lines.push("");
  lines.push("tool_summary:");
  const sorted = Object.entries(skeleton.toolSummary).sort(([, a], [, b]) => b - a);
  if (sorted.length === 0) {
    lines.push("  {}");
  } else {
    for (const [tool, count] of sorted) {
      lines.push(`  ${tool}: ${count}`);
    }
  }

  lines.push("");
  lines.push("phases:");
  if (skeleton.phases.length === 0) {
    lines.push("  []");
  } else {
    for (const p of skeleton.phases) {
      lines.push(`  - {phase: ${p.phase}, start: "${p.start}", end: "${p.end}", tools: ${p.tools}, dominant: "${p.dominant}"}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ─── Weekly Summary ──────────────────────────────────────────────

interface WeeklySummary {
  period: { start: string; end: string };
  totals: {
    sessions: number;
    runtimes: Record<string, number>;
    total_tool_calls: number;
    total_user_turns: number;
    workspace_dispatches: number;
  };
  archetype_distribution: Record<string, number>;
  top_tools: Array<{ tool: string; count: number; pct: number }>;
  skill_usage: Array<{ skill: string; invocations: number; sessions: number; archetypes: string[] }>;
  subagent_usage: Array<{ type: string; invocations: number; sessions: number; archetypes: string[] }>;
  agent_setting_adoption: {
    with_setting: number;
    without_setting: number;
    settings: Record<string, number>;
  };
  issues_touched: Array<{ issue: string; sessions: number; archetypes: string[] }>;
}

function generateWeeklySummary(skeletons: SessionSkeleton[], weekEnd: Date): WeeklySummary {
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const weekEndEod = new Date(weekEnd);
  weekEndEod.setHours(23, 59, 59, 999);

  // Filter to sessions within the week window
  const filtered = skeletons.filter((sk) => {
    const started = new Date(sk.session.started_at);
    return started >= weekStart && started <= weekEndEod;
  });

  const runtimes: Record<string, number> = {};
  const archetypes: Record<string, number> = {};
  const allToolCounts: Record<string, number> = {};
  let totalTools = 0;
  let totalTurns = 0;
  let totalDispatches = 0;
  const issueMap = new Map<string, { count: number; archetypes: string[] }>();
  // Skill usage: skill_name → { invocations, sessions (Set), archetypes }
  const skillMap = new Map<string, { invocations: number; sessions: Set<string>; archetypes: Set<string> }>();
  // Subagent usage: subagent_type → { invocations, sessions (Set), archetypes }
  const subagentMap = new Map<string, { invocations: number; sessions: Set<string>; archetypes: Set<string> }>();
  // Agent setting adoption
  let withSetting = 0;
  let withoutSetting = 0;
  const agentSettings: Record<string, number> = {};

  for (const sk of filtered) {
    const rt = sk.session.runtime;
    const sid = sk.session.session_id;
    const arch = sk.session.archetype;
    runtimes[rt] = (runtimes[rt] || 0) + 1;
    archetypes[arch] = (archetypes[arch] || 0) + 1;
    totalTools += sk.session.total_tool_calls;
    totalTurns += sk.session.user_turns;
    totalDispatches += sk.session.workspace_dispatches;

    for (const [tool, count] of Object.entries(sk.toolSummary)) {
      allToolCounts[tool] = (allToolCounts[tool] || 0) + count;
    }

    if (sk.session.issue_id) {
      const existing = issueMap.get(sk.session.issue_id);
      if (existing) {
        existing.count++;
        existing.archetypes.push(arch);
      } else {
        issueMap.set(sk.session.issue_id, { count: 1, archetypes: [arch] });
      }
    }

    // Aggregate skill_name and subagent_type from tool events
    for (const t of sk.tools) {
      if (t.skill_name) {
        const entry = skillMap.get(t.skill_name);
        if (entry) {
          entry.invocations++;
          entry.sessions.add(sid);
          entry.archetypes.add(arch);
        } else {
          skillMap.set(t.skill_name, { invocations: 1, sessions: new Set([sid]), archetypes: new Set([arch]) });
        }
      }
      if (t.subagent_type) {
        const entry = subagentMap.get(t.subagent_type);
        if (entry) {
          entry.invocations++;
          entry.sessions.add(sid);
          entry.archetypes.add(arch);
        } else {
          subagentMap.set(t.subagent_type, { invocations: 1, sessions: new Set([sid]), archetypes: new Set([arch]) });
        }
      }
    }

    // Agent setting adoption
    if (sk.session.agent_setting) {
      withSetting++;
      agentSettings[sk.session.agent_setting] = (agentSettings[sk.session.agent_setting] || 0) + 1;
    } else {
      withoutSetting++;
    }
  }

  const topTools = Object.entries(allToolCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([tool, count]) => ({
      tool,
      count,
      pct: totalTools > 0 ? Math.round((count / totalTools) * 1000) / 10 : 0,
    }));

  const skillUsage = Array.from(skillMap.entries())
    .map(([skill, data]) => ({
      skill,
      invocations: data.invocations,
      sessions: data.sessions.size,
      archetypes: Array.from(data.archetypes),
    }))
    .sort((a, b) => b.invocations - a.invocations);

  const subagentUsage = Array.from(subagentMap.entries())
    .map(([type, data]) => ({
      type,
      invocations: data.invocations,
      sessions: data.sessions.size,
      archetypes: Array.from(data.archetypes),
    }))
    .sort((a, b) => b.invocations - a.invocations);

  const issuesTouched = Array.from(issueMap.entries())
    .map(([issue, data]) => ({ issue, sessions: data.count, archetypes: data.archetypes }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    period: {
      start: formatDate(weekStart),
      end: formatDate(weekEnd),
    },
    totals: {
      sessions: filtered.length,
      runtimes,
      total_tool_calls: totalTools,
      total_user_turns: totalTurns,
      workspace_dispatches: totalDispatches,
    },
    archetype_distribution: archetypes,
    top_tools: topTools,
    skill_usage: skillUsage,
    subagent_usage: subagentUsage,
    agent_setting_adoption: {
      with_setting: withSetting,
      without_setting: withoutSetting,
      settings: agentSettings,
    },
    issues_touched: issuesTouched,
  };
}

function summaryToYaml(summary: WeeklySummary): string {
  const lines: string[] = [];

  lines.push("period:");
  lines.push(`  start: "${summary.period.start}"`);
  lines.push(`  end: "${summary.period.end}"`);

  lines.push("");
  lines.push("totals:");
  lines.push(`  sessions: ${summary.totals.sessions}`);
  lines.push("  runtimes:");
  for (const [rt, count] of Object.entries(summary.totals.runtimes)) {
    lines.push(`    ${rt}: ${count}`);
  }
  lines.push(`  total_tool_calls: ${summary.totals.total_tool_calls}`);
  lines.push(`  total_user_turns: ${summary.totals.total_user_turns}`);
  lines.push(`  workspace_dispatches: ${summary.totals.workspace_dispatches}`);

  lines.push("");
  lines.push("archetype_distribution:");
  for (const [arch, count] of Object.entries(summary.archetype_distribution).sort(([, a], [, b]) => b - a)) {
    lines.push(`  ${arch}: ${count}`);
  }

  lines.push("");
  lines.push("top_tools:");
  if (summary.top_tools.length === 0) {
    lines.push("  []");
  } else {
    for (const t of summary.top_tools) {
      lines.push(`  - {tool: "${t.tool}", count: ${t.count}, pct: ${t.pct}}`);
    }
  }

  lines.push("");
  lines.push("skill_usage:");
  if (summary.skill_usage.length === 0) {
    lines.push("  []");
  } else {
    for (const s of summary.skill_usage) {
      lines.push(`  - {skill: "${s.skill}", invocations: ${s.invocations}, sessions: ${s.sessions}, archetypes: [${s.archetypes.join(", ")}]}`);
    }
  }

  lines.push("");
  lines.push("subagent_usage:");
  if (summary.subagent_usage.length === 0) {
    lines.push("  []");
  } else {
    for (const s of summary.subagent_usage) {
      lines.push(`  - {type: "${s.type}", invocations: ${s.invocations}, sessions: ${s.sessions}, archetypes: [${s.archetypes.join(", ")}]}`);
    }
  }

  lines.push("");
  lines.push("agent_setting_adoption:");
  lines.push(`  with_setting: ${summary.agent_setting_adoption.with_setting}`);
  lines.push(`  without_setting: ${summary.agent_setting_adoption.without_setting}`);
  lines.push("  settings:");
  const settingsEntries = Object.entries(summary.agent_setting_adoption.settings).sort(([, a], [, b]) => b - a);
  if (settingsEntries.length === 0) {
    lines.push("    {}");
  } else {
    for (const [setting, count] of settingsEntries) {
      lines.push(`    "${setting}": ${count}`);
    }
  }

  lines.push("");
  lines.push("issues_touched:");
  if (summary.issues_touched.length === 0) {
    lines.push("  []");
  } else {
    for (const it of summary.issues_touched) {
      lines.push(`  - {issue: "${it.issue}", sessions: ${it.sessions}, archetypes: [${it.archetypes.join(", ")}]}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ─── Utilities ───────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Query Mode: Load & Filter Skeletons ─────────────────────────

interface QueryFilters {
  archetype?: string;
  runtime?: string;
  skill?: string;
  subagent?: string;
  issue?: string;
  hasSkill?: boolean;      // sessions that invoked ANY skill
  noSkill?: boolean;       // sessions that invoked NO skills
  hasSetting?: boolean;    // sessions with agent_setting
  noSetting?: boolean;     // sessions without agent_setting
  minTools?: number;
  maxTools?: number;
  branch?: string;
}

type QueryReport =
  | "sessions"          // list matching sessions (default)
  | "skill-gaps"        // skills that exist but were never/rarely invoked
  | "subagent-patterns" // subagent type distribution by archetype
  | "skill-by-archetype"// skill usage cross-tabulated with archetype
  | "session-detail"    // detailed view of a single session (by session_id)
  | "anomalies";        // sessions with unusual patterns

function loadSkeletons(skeletonsDir: string, since?: Date): SessionSkeleton[] {
  if (!existsSync(skeletonsDir)) return [];
  const files = readdirSync(skeletonsDir).filter(f => f.endsWith(".yaml"));
  const skeletons: SessionSkeleton[] = [];

  for (const file of files) {
    try {
      const raw = require("node:fs").readFileSync(join(skeletonsDir, file), "utf8");
      const sk = parseSkeletonYaml(raw);
      if (sk) {
        if (since && new Date(sk.session.started_at) < since) continue;
        skeletons.push(sk);
      }
    } catch {
      continue;
    }
  }
  return skeletons;
}

/** Minimal YAML parser for our known skeleton format */
function parseSkeletonYaml(raw: string): SessionSkeleton | null {
  const session: any = {};
  const tools: ToolEvent[] = [];
  const toolSummary: Record<string, number> = {};
  const phases: PhaseEvent[] = [];

  let currentSection = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Section headers
    if (trimmed === "session:") { currentSection = "session"; continue; }
    if (trimmed === "tools:") { currentSection = "tools"; continue; }
    if (trimmed === "tool_summary:") { currentSection = "tool_summary"; continue; }
    if (trimmed === "phases:") { currentSection = "phases"; continue; }

    if (currentSection === "session" && trimmed.startsWith("  ") === false && trimmed.includes(":")) {
      // top-level key outside session — switch section
    }

    if (currentSection === "session") {
      const m = trimmed.match(/^(\w+):\s*(.*)$/);
      if (m) {
        let val: any = m[2];
        // Strip quotes
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val === "null") val = null;
        else if (val === "[]") val = [];
        else if (!isNaN(Number(val)) && val !== "") val = Number(val);
        session[m[1]] = val;
      }
      // pr_urls array items
      if (trimmed.startsWith("- ") && session.pr_urls !== undefined) {
        if (!Array.isArray(session.pr_urls)) session.pr_urls = [];
        let url = trimmed.slice(2).trim();
        if (url.startsWith('"') && url.endsWith('"')) url = url.slice(1, -1);
        session.pr_urls.push(url);
      }
    }

    if (currentSection === "tools" && trimmed.startsWith("- {")) {
      const inner = trimmed.slice(3, -1); // strip "- {" and "}"
      const ev: any = {};
      // Parse key: value pairs (handles quoted and unquoted values)
      for (const pair of inner.split(/,\s*/)) {
        const cm = pair.match(/^(\w+):\s*(.+)$/);
        if (cm) {
          let v: any = cm[2].trim();
          if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
          else if (v === "true") v = true;
          else if (v === "false") v = false;
          else if (!isNaN(Number(v))) v = Number(v);
          ev[cm[1]] = v;
        }
      }
      tools.push(ev as ToolEvent);
    }

    if (currentSection === "tool_summary") {
      const m = trimmed.match(/^([\w:]+):\s*(\d+)$/);
      if (m) toolSummary[m[1]] = Number(m[2]);
    }

    if (currentSection === "phases" && trimmed.startsWith("- {")) {
      const inner = trimmed.slice(3, -1);
      const ev: any = {};
      for (const pair of inner.split(/,\s*/)) {
        const cm = pair.match(/^(\w+):\s*(.+)$/);
        if (cm) {
          let v: any = cm[2].trim();
          if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
          else if (!isNaN(Number(v))) v = Number(v);
          ev[cm[1]] = v;
        }
      }
      phases.push(ev as PhaseEvent);
    }
  }

  if (!session.session_id) return null;
  if (!Array.isArray(session.pr_urls)) session.pr_urls = [];

  return { session: session as SessionEvent, tools, phases, toolSummary };
}

function applyFilters(skeletons: SessionSkeleton[], filters: QueryFilters): SessionSkeleton[] {
  return skeletons.filter(sk => {
    if (filters.archetype && sk.session.archetype !== filters.archetype) return false;
    if (filters.runtime && sk.session.runtime !== filters.runtime) return false;
    if (filters.issue && sk.session.issue_id !== filters.issue) return false;
    if (filters.branch && sk.session.branch !== filters.branch) return false;
    if (filters.minTools && sk.session.total_tool_calls < filters.minTools) return false;
    if (filters.maxTools && sk.session.total_tool_calls > filters.maxTools) return false;

    if (filters.skill) {
      const hasIt = sk.tools.some(t => t.skill_name === filters.skill);
      if (!hasIt) return false;
    }
    if (filters.subagent) {
      const hasIt = sk.tools.some(t => t.subagent_type === filters.subagent);
      if (!hasIt) return false;
    }
    if (filters.hasSkill) {
      if (!sk.tools.some(t => t.skill_name)) return false;
    }
    if (filters.noSkill) {
      if (sk.tools.some(t => t.skill_name)) return false;
    }
    if (filters.hasSetting) {
      if (!sk.session.agent_setting) return false;
    }
    if (filters.noSetting) {
      if (sk.session.agent_setting) return false;
    }
    return true;
  });
}

function runReport(report: QueryReport, skeletons: SessionSkeleton[], sessionId?: string) {
  switch (report) {
    case "sessions":
      reportSessions(skeletons);
      break;
    case "skill-gaps":
      reportSkillGaps(skeletons);
      break;
    case "subagent-patterns":
      reportSubagentPatterns(skeletons);
      break;
    case "skill-by-archetype":
      reportSkillByArchetype(skeletons);
      break;
    case "session-detail":
      reportSessionDetail(skeletons, sessionId);
      break;
    case "anomalies":
      reportAnomalies(skeletons);
      break;
  }
}

function reportSessions(skeletons: SessionSkeleton[]) {
  console.log(`Found ${skeletons.length} matching sessions:\n`);
  // Sort by start time descending
  const sorted = [...skeletons].sort((a, b) =>
    b.session.started_at.localeCompare(a.session.started_at));

  for (const sk of sorted) {
    const s = sk.session;
    const skills = [...new Set(sk.tools.filter(t => t.skill_name).map(t => t.skill_name))];
    const subagents = [...new Set(sk.tools.filter(t => t.subagent_type).map(t => t.subagent_type))];
    const date = s.started_at.slice(0, 16).replace("T", " ");

    let line = `  ${date}  ${s.archetype.padEnd(14)} ${String(s.total_tool_calls).padStart(4)} tools  ${s.duration_minutes.toFixed(0).padStart(4)}min`;
    if (s.issue_id) line += `  issue=${s.issue_id}`;
    if (s.runtime !== "claude_code") line += `  [${s.runtime}]`;
    if (skills.length > 0) line += `  skills=[${skills.join(",")}]`;
    if (subagents.length > 0) line += `  subagents=[${subagents.join(",")}]`;
    if (s.agent_setting) line += `  agent=${s.agent_setting}`;
    console.log(line);
  }
}

function reportSkillGaps(skeletons: SessionSkeleton[]) {
  // Known skills from the framework inventory
  const KNOWN_SKILLS = [
    "task-init", "workspace-orchestrate", "agentic-env-lifecycle",
    "issue-tracker", "issue-tracker-vibe-kanban", "issue-tracker-github-issues", "issue-tracker-local",
    "issue-sync", "holicode-sync", "holicode-migrate",
    "intake-triage", "data-ingestion", "gh-auth",
    "tpm-report", "code-review", "inbox-process",
  ];

  const observed = new Map<string, { count: number; sessions: number; archetypes: Set<string> }>();

  for (const sk of skeletons) {
    const sessionSkills = new Set<string>();
    for (const t of sk.tools) {
      if (!t.skill_name) continue;
      sessionSkills.add(t.skill_name);
      const entry = observed.get(t.skill_name);
      if (entry) {
        entry.count++;
      } else {
        observed.set(t.skill_name, { count: 1, sessions: 0, archetypes: new Set() });
      }
    }
    for (const skill of sessionSkills) {
      const entry = observed.get(skill)!;
      entry.sessions++;
      entry.archetypes.add(sk.session.archetype);
    }
  }

  console.log(`Skill gap analysis across ${skeletons.length} sessions:\n`);
  console.log("  SKILL                          INVOCATIONS  SESSIONS  ARCHETYPES");
  console.log("  " + "─".repeat(75));

  for (const skill of KNOWN_SKILLS) {
    const data = observed.get(skill);
    if (!data) {
      console.log(`  ${skill.padEnd(32)} ${"0".padStart(5)}       ${"0".padStart(4)}  ⚠ NEVER INVOKED`);
    } else {
      const archs = Array.from(data.archetypes).join(", ");
      console.log(`  ${skill.padEnd(32)} ${String(data.count).padStart(5)}       ${String(data.sessions).padStart(4)}  ${archs}`);
    }
  }

  // Unknown skills (observed but not in known list)
  const unknown = Array.from(observed.keys()).filter(k => !KNOWN_SKILLS.includes(k));
  if (unknown.length > 0) {
    console.log("\n  Unknown skills (not in KNOWN_SKILLS):");
    for (const skill of unknown) {
      const data = observed.get(skill)!;
      console.log(`  ${skill.padEnd(32)} ${String(data.count).padStart(5)}       ${String(data.sessions).padStart(4)}`);
    }
  }
}

function reportSubagentPatterns(skeletons: SessionSkeleton[]) {
  // Cross-tabulate: archetype × subagent_type
  const table = new Map<string, Map<string, number>>();
  const allSubagents = new Set<string>();

  for (const sk of skeletons) {
    const arch = sk.session.archetype;
    if (!table.has(arch)) table.set(arch, new Map());
    const row = table.get(arch)!;

    for (const t of sk.tools) {
      if (!t.subagent_type) continue;
      allSubagents.add(t.subagent_type);
      row.set(t.subagent_type, (row.get(t.subagent_type) || 0) + 1);
    }
  }

  const subagentList = Array.from(allSubagents).sort();
  const colWidth = 12;

  console.log(`Subagent type usage by archetype (${skeletons.length} sessions):\n`);
  // Header
  let header = "  " + "ARCHETYPE".padEnd(16);
  for (const sa of subagentList) header += sa.slice(0, colWidth).padStart(colWidth);
  console.log(header);
  console.log("  " + "─".repeat(16 + subagentList.length * colWidth));

  // Rows
  for (const [arch, row] of Array.from(table.entries()).sort()) {
    let line = "  " + arch.padEnd(16);
    for (const sa of subagentList) {
      const val = row.get(sa) || 0;
      line += (val > 0 ? String(val) : ".").padStart(colWidth);
    }
    console.log(line);
  }
}

function reportSkillByArchetype(skeletons: SessionSkeleton[]) {
  // Cross-tabulate: skill × archetype
  const table = new Map<string, Map<string, number>>();
  const allArchetypes = new Set<string>();

  for (const sk of skeletons) {
    const arch = sk.session.archetype;
    allArchetypes.add(arch);

    for (const t of sk.tools) {
      if (!t.skill_name) continue;
      if (!table.has(t.skill_name)) table.set(t.skill_name, new Map());
      const row = table.get(t.skill_name)!;
      row.set(arch, (row.get(arch) || 0) + 1);
    }
  }

  const archList = Array.from(allArchetypes).sort();
  const colWidth = 14;

  console.log(`Skill usage by archetype (${skeletons.length} sessions):\n`);
  let header = "  " + "SKILL".padEnd(28);
  for (const a of archList) header += a.slice(0, colWidth).padStart(colWidth);
  header += "TOTAL".padStart(colWidth);
  console.log(header);
  console.log("  " + "─".repeat(28 + (archList.length + 1) * colWidth));

  const rows = Array.from(table.entries()).sort((a, b) => {
    const totalA = Array.from(a[1].values()).reduce((s, v) => s + v, 0);
    const totalB = Array.from(b[1].values()).reduce((s, v) => s + v, 0);
    return totalB - totalA;
  });

  for (const [skill, row] of rows) {
    let line = "  " + skill.padEnd(28);
    let total = 0;
    for (const a of archList) {
      const val = row.get(a) || 0;
      total += val;
      line += (val > 0 ? String(val) : ".").padStart(colWidth);
    }
    line += String(total).padStart(colWidth);
    console.log(line);
  }
}

function reportSessionDetail(skeletons: SessionSkeleton[], sessionId?: string) {
  if (!sessionId) {
    console.error("--session-id required for session-detail report");
    process.exit(1);
  }

  const sk = skeletons.find(s =>
    s.session.session_id === sessionId ||
    s.session.session_id.startsWith(sessionId));

  if (!sk) {
    console.error(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  const s = sk.session;
  console.log("Session Detail:");
  console.log(`  ID:          ${s.session_id}`);
  console.log(`  Runtime:     ${s.runtime}`);
  console.log(`  Archetype:   ${s.archetype}`);
  console.log(`  Issue:       ${s.issue_id || "none"}`);
  console.log(`  Branch:      ${s.branch || "none"}`);
  console.log(`  Agent:       ${s.agent_setting || "none"}`);
  console.log(`  Started:     ${s.started_at}`);
  console.log(`  Ended:       ${s.ended_at}`);
  console.log(`  Duration:    ${s.duration_minutes.toFixed(1)} min`);
  console.log(`  User turns:  ${s.user_turns}`);
  console.log(`  Tool calls:  ${s.total_tool_calls}`);
  console.log(`  Compactions: ${s.compaction_count}`);
  console.log(`  Subagents:   ${s.subagent_count}`);
  console.log(`  Dispatches:  ${s.workspace_dispatches}`);
  console.log(`  Model:       ${s.model}`);
  console.log(`  File size:   ${(s.file_size_bytes / 1024).toFixed(0)} KB`);
  if (s.pr_urls.length > 0) {
    console.log(`  PRs:         ${s.pr_urls.join(", ")}`);
  }

  console.log("\nTool Summary:");
  const sorted = Object.entries(sk.toolSummary).sort(([, a], [, b]) => b - a);
  for (const [tool, count] of sorted) {
    console.log(`  ${tool.padEnd(45)} ${count}`);
  }

  const skills = sk.tools.filter(t => t.skill_name);
  if (skills.length > 0) {
    console.log("\nSkill Invocations:");
    for (const t of skills) {
      console.log(`  ${t.ts.slice(11, 19)}  turn ${t.turn}  ${t.skill_name}`);
    }
  }

  const subagents = sk.tools.filter(t => t.subagent_type);
  if (subagents.length > 0) {
    console.log("\nSubagent Dispatches:");
    for (const t of subagents) {
      console.log(`  ${t.ts.slice(11, 19)}  turn ${t.turn}  ${t.subagent_type}`);
    }
  }

  console.log("\nPhases:");
  for (const p of sk.phases) {
    const start = p.start.slice(11, 19);
    const end = p.end.slice(11, 19);
    console.log(`  ${start}-${end}  ${p.phase.padEnd(12)} ${String(p.tools).padStart(3)} tools  dominant=${p.dominant}`);
  }
}

function reportAnomalies(skeletons: SessionSkeleton[]) {
  console.log(`Anomaly detection across ${skeletons.length} sessions:\n`);

  // 1. Orchestrator sessions without workspace-orchestrate skill
  const orchestratorsNoSkill = skeletons.filter(sk =>
    sk.session.archetype === "orchestrator" &&
    !sk.tools.some(t => t.skill_name === "workspace-orchestrate"));
  if (orchestratorsNoSkill.length > 0) {
    console.log(`⚠ Orchestrator sessions without workspace-orchestrate skill: ${orchestratorsNoSkill.length}`);
    for (const sk of orchestratorsNoSkill.slice(0, 5)) {
      const skills = [...new Set(sk.tools.filter(t => t.skill_name).map(t => t.skill_name))];
      console.log(`    ${sk.session.started_at.slice(0, 16)}  issue=${sk.session.issue_id || "none"}  skills=[${skills.join(",")}]`);
    }
    console.log("");
  }

  // 2. Sessions with high Explore count (>10 Explore subagents = possible over-exploration)
  const overExplore = skeletons.filter(sk => {
    const exploreCount = sk.tools.filter(t => t.subagent_type === "Explore").length;
    return exploreCount > 10;
  });
  if (overExplore.length > 0) {
    console.log(`⚠ Sessions with >10 Explore subagents (possible over-exploration): ${overExplore.length}`);
    for (const sk of overExplore.slice(0, 5)) {
      const count = sk.tools.filter(t => t.subagent_type === "Explore").length;
      console.log(`    ${sk.session.started_at.slice(0, 16)}  ${sk.session.archetype}  issue=${sk.session.issue_id || "none"}  explore_count=${count}`);
    }
    console.log("");
  }

  // 3. Implementation sessions without any skill invocation
  const implNoSkill = skeletons.filter(sk =>
    sk.session.archetype === "implementation" &&
    !sk.tools.some(t => t.skill_name));
  if (implNoSkill.length > 0) {
    console.log(`⚠ Implementation sessions with no skill invocations: ${implNoSkill.length}/${skeletons.filter(s => s.session.archetype === "implementation").length}`);
    for (const sk of implNoSkill.slice(0, 5)) {
      console.log(`    ${sk.session.started_at.slice(0, 16)}  issue=${sk.session.issue_id || "none"}  tools=${sk.session.total_tool_calls}`);
    }
    console.log("");
  }

  // 4. Sessions with no task-init at boot (skill should typically be first)
  const noTaskInit = skeletons.filter(sk =>
    sk.session.total_tool_calls > 10 && // non-trivial sessions
    !sk.tools.some(t => t.skill_name === "task-init"));
  const totalNonTrivial = skeletons.filter(sk => sk.session.total_tool_calls > 10).length;
  if (noTaskInit.length > 0) {
    console.log(`⚠ Non-trivial sessions (>10 tools) without task-init: ${noTaskInit.length}/${totalNonTrivial}`);
    console.log("");
  }

  // 5. Sessions with very high tool counts but low user turns (runaway agent?)
  const highRatio = skeletons.filter(sk =>
    sk.session.user_turns > 0 &&
    sk.session.total_tool_calls / sk.session.user_turns > 50);
  if (highRatio.length > 0) {
    console.log(`⚠ Sessions with >50 tools/user_turn (possible runaway): ${highRatio.length}`);
    for (const sk of highRatio.slice(0, 5)) {
      const ratio = (sk.session.total_tool_calls / sk.session.user_turns).toFixed(0);
      console.log(`    ${sk.session.started_at.slice(0, 16)}  ${sk.session.archetype}  tools=${sk.session.total_tool_calls}  turns=${sk.session.user_turns}  ratio=${ratio}`);
    }
    console.log("");
  }

  // Summary
  const totalAnomalies = orchestratorsNoSkill.length + overExplore.length +
    implNoSkill.length + noTaskInit.length + highRatio.length;
  console.log(`Total anomalies found: ${totalAnomalies}`);
}

// ─── CLI Argument Parsing ────────────────────────────────────────

type CliMode = "extract" | "query";

interface CliArgs {
  mode: CliMode;
  // Extract mode
  runtime: Runtime | "all";
  since?: Date;
  outputDir: string;
  // Query mode
  report: QueryReport;
  filters: QueryFilters;
  sessionId?: string;
}

function parseArgs(argv: string[]): CliArgs {
  let mode: CliMode = "extract";
  let runtime: Runtime | "all" = "all";
  let since: Date | undefined;
  let outputDir = join(process.cwd(), ".holicode", "analysis", "session-logs");
  let report: QueryReport = "sessions";
  const filters: QueryFilters = {};
  let sessionId: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    // Mode selection
    if (arg === "query" || arg === "--query") {
      mode = "query";
      continue;
    }
    if (arg === "extract" || arg === "--extract") {
      mode = "extract";
      continue;
    }

    // Common
    if (arg === "--runtime" && argv[i + 1]) {
      const val = argv[++i];
      if (val === "claude_code" || val === "opencode" || val === "all") {
        runtime = val;
        if (mode === "query") filters.runtime = val === "all" ? undefined : val;
      } else {
        console.error(`Invalid runtime: ${val}. Use claude_code, opencode, or all.`);
        process.exit(1);
      }
    } else if (arg === "--since" && argv[i + 1]) {
      const dateStr = argv[++i];
      since = new Date(dateStr);
      if (isNaN(since.getTime())) {
        console.error(`Invalid date: ${dateStr}`);
        process.exit(1);
      }
    } else if (arg === "--output-dir" && argv[i + 1]) {
      outputDir = argv[++i];

    // Query-specific
    } else if (arg === "--report" && argv[i + 1]) {
      const val = argv[++i] as QueryReport;
      const validReports: QueryReport[] = ["sessions", "skill-gaps", "subagent-patterns", "skill-by-archetype", "session-detail", "anomalies"];
      if (!validReports.includes(val)) {
        console.error(`Invalid report: ${val}. Use: ${validReports.join(", ")}`);
        process.exit(1);
      }
      report = val;
    } else if (arg === "--archetype" && argv[i + 1]) {
      filters.archetype = argv[++i];
    } else if (arg === "--skill" && argv[i + 1]) {
      filters.skill = argv[++i];
    } else if (arg === "--subagent" && argv[i + 1]) {
      filters.subagent = argv[++i];
    } else if (arg === "--issue" && argv[i + 1]) {
      filters.issue = argv[++i];
    } else if (arg === "--branch" && argv[i + 1]) {
      filters.branch = argv[++i];
    } else if (arg === "--has-skill") {
      filters.hasSkill = true;
    } else if (arg === "--no-skill") {
      filters.noSkill = true;
    } else if (arg === "--has-setting") {
      filters.hasSetting = true;
    } else if (arg === "--no-setting") {
      filters.noSetting = true;
    } else if (arg === "--min-tools" && argv[i + 1]) {
      filters.minTools = Number(argv[++i]);
    } else if (arg === "--max-tools" && argv[i + 1]) {
      filters.maxTools = Number(argv[++i]);
    } else if (arg === "--session-id" && argv[i + 1]) {
      sessionId = argv[++i];

    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: npx tsx scripts/analyze-sessions.ts [extract|query] [options]");
      console.log("");
      console.log("Modes:");
      console.log("  extract (default)  Extract skeletons from raw session logs");
      console.log("  query              Query previously extracted skeletons");
      console.log("");
      console.log("Extract options:");
      console.log("  --runtime claude_code|opencode|all  Runtime to extract (default: all)");
      console.log("  --since DATE                        Only process sessions after DATE");
      console.log("  --output-dir PATH                   Output directory (default: .holicode/analysis/session-logs)");
      console.log("");
      console.log("Query options:");
      console.log("  --report TYPE       Report type: sessions, skill-gaps, subagent-patterns,");
      console.log("                      skill-by-archetype, session-detail, anomalies");
      console.log("  --archetype NAME    Filter by archetype");
      console.log("  --skill NAME        Filter to sessions using this skill");
      console.log("  --subagent NAME     Filter to sessions using this subagent type");
      console.log("  --issue ID          Filter by issue ID (HOL-xxx or UUID)");
      console.log("  --branch NAME       Filter by branch name");
      console.log("  --has-skill         Only sessions with at least one skill invocation");
      console.log("  --no-skill          Only sessions with no skill invocations");
      console.log("  --has-setting       Only sessions with agent_setting");
      console.log("  --no-setting        Only sessions without agent_setting");
      console.log("  --min-tools N       Minimum total tool calls");
      console.log("  --max-tools N       Maximum total tool calls");
      console.log("  --session-id ID     Session ID for session-detail report");
      console.log("  --since DATE        Only include sessions after DATE");
      console.log("");
      console.log("Examples:");
      console.log("  npx tsx scripts/analyze-sessions.ts query --report anomalies");
      console.log("  npx tsx scripts/analyze-sessions.ts query --report skill-gaps --since 2026-02-20");
      console.log("  npx tsx scripts/analyze-sessions.ts query --archetype orchestrator --has-skill");
      console.log("  npx tsx scripts/analyze-sessions.ts query --report session-detail --session-id ses_xxx");
      console.log("  npx tsx scripts/analyze-sessions.ts query --skill task-init --report sessions");
      process.exit(0);
    }
  }

  return { mode, runtime, since, outputDir, report, filters, sessionId };
}

// ─── Main ────────────────────────────────────────────────────────

async function mainExtract(args: CliArgs) {
  const { runtime, since, outputDir } = args;

  const skeletonsDir = join(outputDir, "skeletons");
  const summariesDir = join(outputDir, "summaries");
  mkdirSync(skeletonsDir, { recursive: true });
  mkdirSync(summariesDir, { recursive: true });

  const allSkeletons: SessionSkeleton[] = [];
  let ccCount = 0;
  let ocCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // ── Claude Code ──
  if (runtime === "all" || runtime === "claude_code") {
    const extractor = new ClaudeCodeExtractor();
    const sessions = await extractor.discoverSessions(since);
    console.log(`Discovered ${sessions.length} Claude Code sessions`);

    for (const sessionRef of sessions) {
      try {
        const skeleton = await extractor.extractSkeleton(sessionRef);
        if (!skeleton) {
          skippedCount++;
          continue;
        }
        allSkeletons.push(skeleton);
        ccCount++;

        const yamlContent = skeletonToYaml(skeleton);
        const outPath = join(skeletonsDir, `${skeleton.session.session_id}.yaml`);
        await writeFile(outPath, yamlContent);
      } catch (err: any) {
        errorCount++;
        const fname = basename(sessionRef);
        console.error(`  ERROR [${fname}]: ${err.message}`);
      }
    }
    console.log(`  Extracted: ${ccCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
  }

  // ── OpenCode ──
  if (runtime === "all" || runtime === "opencode") {
    const extractor = new OpenCodeExtractor();
    const sessions = await extractor.discoverSessions(since);
    console.log(`Discovered ${sessions.length} OpenCode sessions`);

    const prevErrors = errorCount;
    const prevSkipped = skippedCount;
    for (const sessionRef of sessions) {
      try {
        const skeleton = await extractor.extractSkeleton(sessionRef);
        if (!skeleton) {
          skippedCount++;
          continue;
        }
        allSkeletons.push(skeleton);
        ocCount++;

        const yamlContent = skeletonToYaml(skeleton);
        const outPath = join(skeletonsDir, `${skeleton.session.session_id}.yaml`);
        await writeFile(outPath, yamlContent);
      } catch (err: any) {
        errorCount++;
        console.error(`  ERROR [${sessionRef}]: ${err.message}`);
      }
    }
    console.log(`  Extracted: ${ocCount}, Skipped: ${skippedCount - prevSkipped}, Errors: ${errorCount - prevErrors}`);
  }

  // ── Weekly Summary ──
  const now = new Date();
  const summary = generateWeeklySummary(allSkeletons, now);
  const summaryYaml = summaryToYaml(summary);
  const summaryPath = join(summariesDir, `weekly-${formatDate(now)}.yaml`);
  await writeFile(summaryPath, summaryYaml);

  // ── Report ──
  console.log("");
  console.log(`Total: ${allSkeletons.length} skeletons (CC: ${ccCount}, OC: ${ocCount})`);
  console.log(`Skeletons: ${skeletonsDir}`);
  console.log(`Summary:   ${summaryPath}`);

  if (allSkeletons.length > 0) {
    console.log("");
    console.log("Archetype distribution:");
    const archetypes: Record<string, number> = {};
    for (const sk of allSkeletons) {
      archetypes[sk.session.archetype] = (archetypes[sk.session.archetype] || 0) + 1;
    }
    for (const [arch, count] of Object.entries(archetypes).sort(([, a], [, b]) => b - a)) {
      console.log(`  ${arch}: ${count}`);
    }
  }
}

function mainQuery(args: CliArgs) {
  const skeletonsDir = join(args.outputDir, "skeletons");
  const skeletons = loadSkeletons(skeletonsDir, args.since);

  if (skeletons.length === 0) {
    console.error("No skeletons found. Run extract first: npx tsx scripts/analyze-sessions.ts extract");
    process.exit(1);
  }

  const filtered = applyFilters(skeletons, args.filters);
  runReport(args.report, filtered, args.sessionId);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.mode === "query") {
    mainQuery(args);
  } else {
    await mainExtract(args);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
