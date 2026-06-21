import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["src/index.js"],
  env: {
    ...process.env,
    VEDA_MCP_TOKEN: process.env.VEDA_MCP_TOKEN || "smoke-test-token",
    VEDA_MCP_URL: process.env.VEDA_MCP_URL || "https://veda.app/mcp",
  },
});

const client = new Client({ name: "veda-mcp-smoke", version: "0.1.0" });
await client.connect(transport);
const tools = await client.listTools();
console.log(JSON.stringify(tools.tools.map((tool) => tool.name), null, 2));
await client.close();
