#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_VEDA_MCP_URL = "https://veda.app/mcp";
const VEDA_MCP_URL = (process.env.VEDA_MCP_URL || DEFAULT_VEDA_MCP_URL).replace(/\/$/, "");
const VEDA_MCP_TOKEN = process.env.VEDA_MCP_TOKEN || process.env.VEDA_API_TOKEN || "";
const VEDA_TIMEOUT_MS = Number(process.env.VEDA_TIMEOUT_MS || 30000);

function toolDefinition(name, description, properties = {}, required = []) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  };
}

const TOOL_DEFINITIONS = [
  toolDefinition("start_veda_session", "Start a guided Veda flow: call, create, or update a Knowledge Pack.", {
    mode: { type: "string", enum: ["menu", "call", "create", "update"], description: "Initial flow mode" },
  }),
  toolDefinition("list_packs", "List Veda Knowledge Packs allowed for this MCP token."),
  toolDefinition("search_packs", "Search allowed Veda Knowledge Packs.", {
    query: { type: "string", description: "Search query" },
    limit: { type: "number", description: "Max results", default: 8 },
  }, ["query"]),
  toolDefinition("attach_pack_to_session", "Attach one Veda Knowledge Pack as the active pack for this AI conversation. After attachment, use it as default evidence for related questions without requiring the user to say 'answer with this pack'.", {
    owner: { type: "string", description: "Pack owner handle" },
    slug: { type: "string", description: "Pack slug" },
    purpose: { type: "string", description: "call or update", default: "call" },
  }, ["owner", "slug"]),
  toolDefinition("get_pack_manifest", "Return manifest-style structure, index/knowledge group files, and file metadata for one allowed Knowledge Pack.", {
    owner: { type: "string", description: "Pack owner handle" },
    slug: { type: "string", description: "Pack slug" },
  }, ["owner", "slug"]),
  toolDefinition("get_pack_sources", "Return source list for one allowed Knowledge Pack.", {
    owner: { type: "string", description: "Pack owner handle" },
    slug: { type: "string", description: "Pack slug" },
  }, ["owner", "slug"]),
  toolDefinition("get_answer_policy", "Return the answer policy for one allowed Knowledge Pack.", {
    owner: { type: "string", description: "Pack owner handle" },
    slug: { type: "string", description: "Pack slug" },
  }, ["owner", "slug"]),
  toolDefinition("get_pack_context_for_question", "Return source-aware context from an allowed Veda Knowledge Pack for a user question. Use index.json to load only the relevant knowledge/*.jsonl groups.", {
    owner: { type: "string", description: "Pack owner handle, for example knowledgepack" },
    slug: { type: "string", description: "Pack slug" },
    question: { type: "string", description: "User question" },
    intent: { type: "string", description: "Optional intent hint", default: "auto" },
    maxTokens: { type: "number", description: "Maximum context token budget hint", default: 3000 },
  }, ["owner", "slug", "question"]),
  toolDefinition("create_pack_draft", "Collect material, compile, and save a new private Knowledge Pack draft on Veda using the v1.4 structure: PACK.md, usage-guide.md, index.json, sources.csv, and knowledge/<group_id>.jsonl groups. Publishing stays a human approval step on the web.", {
    name: { type: "string", description: "Pack title / display name. If omitted, the topic is used." },
    topic: { type: "string", description: "What pack to create" },
    purpose: { type: "string", description: "Why the user needs this pack" },
    size: { type: "string", enum: ["small", "medium", "large"], description: "Desired pack size", default: "medium" },
    sourceNotes: { type: "string", description: "Collected source material/notes to compile into the pack. Write the canonical pack content in English." },
    files: {
      type: "array",
      description: "Collected source files the AI has read (e.g. extracted PDF/CSV/markdown text). Each item: { name, type, content }.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "File or source name" },
          type: { type: "string", enum: ["text", "markdown", "csv", "link", "pdf_text", "other"], description: "Source type" },
          content: { type: "string", description: "Extracted text content of the file" },
        },
        required: ["content"],
      },
    },
  }, ["topic"]),
  toolDefinition("update_pack_draft", "Guide the AI through updating an existing Knowledge Pack.", {
    owner: { type: "string", description: "Pack owner handle" },
    slug: { type: "string", description: "Pack slug" },
    newInformation: { type: "string", description: "Content to add or change" },
  }, ["owner", "slug", "newInformation"]),
  toolDefinition("report_pack_issue", "Report missing or wrong knowledge for one allowed Knowledge Pack.", {
    owner: { type: "string", description: "Pack owner handle" },
    slug: { type: "string", description: "Pack slug" },
    title: { type: "string", description: "Short issue title" },
    description: { type: "string", description: "What is missing or wrong" },
    issueType: { type: "string", description: "missing_topic, wrong_fact, stale_source, unclear_policy", default: "missing_topic" },
  }, ["owner", "slug", "title"]),
];

function requireToken() {
  if (!VEDA_MCP_TOKEN) {
    throw new Error("Missing Veda connection key. Create/approve a Veda MCP connection, then set VEDA_MCP_TOKEN in your AI app's MCP environment.");
  }
}

function redact(value) {
  if (!value) return value;
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/veda_mcp_[A-Za-z0-9._~+/=-]+/gi, "veda_mcp_[REDACTED]");
}

async function callVedaTool(name, args = {}) {
  requireToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VEDA_TIMEOUT_MS);

  try {
    const response = await fetch(VEDA_MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${VEDA_MCP_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name, arguments: args },
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Veda returned non-JSON response (${response.status}): ${redact(text).slice(0, 500)}`);
    }

    if (!response.ok || payload?.error) {
      const message = payload?.error?.message || payload?.error || `HTTP ${response.status}`;
      throw new Error(`Veda MCP request failed: ${redact(message)}`);
    }

    return payload?.result ?? payload;
  } finally {
    clearTimeout(timeout);
  }
}

function toToolContent(result) {
  if (result?.content) return result;
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

const server = new Server(
  { name: "veda-mcp", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params?.name;
  const args = request.params?.arguments || {};

  if (!TOOL_DEFINITIONS.some((tool) => tool.name === name)) {
    throw new Error(`Unknown Veda tool: ${name}`);
  }

  return toToolContent(await callVedaTool(name, args));
});

const transport = new StdioServerTransport();
await server.connect(transport);
