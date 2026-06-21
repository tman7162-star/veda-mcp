# Veda MCP

Veda MCP lets Claude, Cursor, Hermes, Codex, and other MCP-capable AI apps read **Veda Knowledge Packs** through a read-only MCP toolset.

> Veda = AI-readable Knowledge Pack repository.  
> You ask inside your AI app; Veda supplies source-aware context through MCP.

## Tools

This MCP exposes two tools:

| Tool | Purpose |
|---|---|
| `list_packs` | List Knowledge Packs allowed for your Veda MCP token. |
| `get_pack_context_for_question` | Return compact, source-aware context from a selected pack for a user question. |

## Quick install by asking your AI

Copy this into the AI app you use for coding/automation:

```text
Install this MCP server for me.

GitHub repository:
https://github.com/tman7162-star/veda-mcp

Use this command-based MCP server:
npx -y github:tman7162-star/veda-mcp

Environment variables:
VEDA_MCP_URL=https://veda.app/mcp
VEDA_MCP_TOKEN=<my Veda MCP token here>

After installing, test it by listing my Veda Knowledge Packs.
```

## Manual MCP config

Most MCP clients accept a config shape similar to this:

```json
{
  "mcpServers": {
    "veda": {
      "command": "npx",
      "args": ["-y", "github:tman7162-star/veda-mcp"],
      "env": {
        "VEDA_MCP_URL": "https://veda.app/mcp",
        "VEDA_MCP_TOKEN": "veda_mcp_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

For local development against a local Veda web app:

```json
{
  "mcpServers": {
    "veda-local": {
      "command": "node",
      "args": ["C:/path/to/veda-mcp/src/index.js"],
      "env": {
        "VEDA_MCP_URL": "http://127.0.0.1:8795/mcp",
        "VEDA_MCP_TOKEN": "veda_mcp_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

## Environment variables

| Variable | Required | Default | Description |
|---|---:|---|---|
| `VEDA_MCP_TOKEN` | yes | - | Veda read/context token generated from your Veda account. |
| `VEDA_MCP_URL` | no | `https://veda.app/mcp` | Veda MCP endpoint. Use a local URL for local development. |
| `VEDA_TIMEOUT_MS` | no | `30000` | Request timeout in milliseconds. |

## Security notes

- Treat `VEDA_MCP_TOKEN` like a password.
- Start with read-only scopes: `pack:read` and `pack:context`.
- If the token leaks, revoke/regenerate it in Veda.
- Do not paste your token into public GitHub issues, screenshots, or commits.

## Development

```bash
npm install
npm run check
npm run smoke:list-tools
```

`smoke:list-tools` verifies that the local stdio MCP server can start and list its tool definitions. It does not require a valid Veda token because it does not call Veda tools.

## License

MIT
