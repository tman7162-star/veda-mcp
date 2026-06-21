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

const TOOL_DEFINITIONS = [
  {
    name: "list_packs",
    description: "List Veda Knowledge Packs allowed for this MCP token.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_pack_context_for_question",
    description: "Return source-aware context from an allowed Veda Knowledge Pack for a user question.",
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Pack owner handle, for example knowledgepack",
        },
        slug: {
          type: "string",
          description: "Pack slug",
        },
        question: {
          type: "string",
          description: "User question to answer with pack context",
        },
        intent: {
          type: "string",
          description: "Optional intent hint",
          default: "auto",
        },
        maxTokens: {
          type: "number",
          description: "Maximum context token budget hint",
          default: 3000,
        },
      },
      required: ["owner", "slug", "question"],
      additionalProperties: false,
    },
  },
];

function requireToken() {
  if (!VEDA_MCP_TOKEN) {
    throw new Error(
      "Missing VEDA_MCP_TOKEN. Create a Veda MCP token in Veda, then set it in your AI app's MCP environment.",
    );
  }
}

function redact(value) {
  if (!value) return value;
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/veda_mcp_[A-Za-z0-9._~+/=-]+/gi, "veda_mcp_[REDACTED]");
}

async function callVeda(method, params = {}) {
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
        method,
        params,
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
  {
    name: "veda-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params?.name;
  const args = request.params?.arguments || {};

  if (name === "list_packs") {
    return toToolContent(await callVeda("tools/call", { name: "list_packs", arguments: args }));
  }

  if (name === "get_pack_context_for_question") {
    return toToolContent(await callVeda("tools/call", { name: "get_pack_context_for_question", arguments: args }));
  }

  throw new Error(`Unknown Veda tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
