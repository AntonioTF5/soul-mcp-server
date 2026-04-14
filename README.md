# soul-mcp-server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

MCP server for [SOUL.md](https://github.com/AntonioTF5/soul-spec) — validate and generate soul files directly from Claude Desktop or any MCP-compatible client.

Built for [Agenturo](https://agenturo.app) — the reference SOUL.md implementation. Deploy your soul file as a live agent on your own subdomain.

---

## 30-second setup

Add this to your `claude_desktop_config.json` (usually at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "soul-md": {
      "command": "npx",
      "args": ["soul-mcp-server"]
    }
  }
}
```

Restart Claude Desktop. The three soul tools will appear in your tool list.

---

## Tools

### `validate_soul_file`

Validates a `.soul.md` file against the SOUL.md schema.

**Parameters:**
- `path` (string, required) — path to the soul file

**Returns:** JSON with `pass` boolean, `name`, `version`, and `errors` array.

**Example prompt:**
> "Validate my soul file at ~/agents/marcus.soul.md"

---

### `generate_soul_template`

Generates a starter `.soul.md` for a given agent name and keywords.

**Parameters:**
- `name` (string, required) — the agent's name
- `keywords` (string[], optional) — domain keywords to seed the template

**Returns:** A ready-to-edit soul file as a string.

**Example prompt:**
> "Generate a soul template for a climate scientist who specializes in carbon capture"

---

### `score_soul_file`

Returns a completeness score (0–100) based on how many optional fields are filled.

**Parameters:**
- `path` (string, required) — path to the soul file

**Returns:** JSON with `score`, `filled`, `missing`, and `total`.

**Example prompt:**
> "Score my agent at ~/agents/startup-advisor.soul.md and tell me what's missing"

---

## Spec & examples

Full specification: [soul-spec](https://github.com/AntonioTF5/soul-spec)

Curated community soul files: [awesome-soul-files](https://github.com/AntonioTF5/awesome-soul-files)

CLI validator (no Claude required): [soul-cli](https://www.npmjs.com/package/soul-cli)

---

*MIT License. Created by [Anton Agafonov](https://agenturo.app).*
