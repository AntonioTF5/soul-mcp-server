#!/usr/bin/env node
/**
 * soul-mcp-server — MCP server for SOUL.md tooling
 *
 * Tools exposed:
 *   validate_soul_file(path)          — validate a soul.md file
 *   generate_soul_template(name, keywords) — generate a starter soul.md
 *   score_soul_file(path)             — completeness score
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import Ajv from "ajv";

// ─── Schema ───────────────────────────────────────────────────────────────────
const SOUL_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["name", "version", "description", "personality"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 100 },
    version: {
      type: "string",
      pattern:
        "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$",
    },
    description: { type: "string", minLength: 10, maxLength: 280 },
    personality: { type: "string", minLength: 50, maxLength: 2000 },
    tone: { type: "string", maxLength: 200 },
    values: {
      type: "array",
      items: { type: "string", maxLength: 100 },
      minItems: 1,
      maxItems: 10,
    },
    constraints: {
      type: "array",
      items: { type: "string", maxLength: 200 },
      minItems: 1,
      maxItems: 10,
    },
    knowledge_domains: {
      type: "array",
      items: { type: "string", maxLength: 100 },
      minItems: 1,
      maxItems: 20,
    },
    communication_style: { type: "string", maxLength: 500 },
    memory_mode: {
      type: "string",
      enum: ["stateless", "session", "persistent"],
    },
    goals: {
      type: "array",
      items: { type: "string", maxLength: 200 },
      minItems: 1,
      maxItems: 5,
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "role"],
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    language: { type: "string", pattern: "^[a-z]{2}(-[A-Z]{2})?$" },
    platform_hints: { type: "object", additionalProperties: true },
  },
  patternProperties: { "^x-": {} },
};

const OPTIONAL_FIELDS = [
  "tone", "values", "constraints", "knowledge_domains",
  "communication_style", "memory_mode", "goals", "relationships",
  "language", "platform_hints",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("No YAML frontmatter found.");
  const parsed = yaml.load(match[1]);
  if (!parsed || typeof parsed !== "object") throw new Error("Empty frontmatter.");
  return parsed as Record<string, unknown>;
}

function validateSoul(filePath: string) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    return { pass: false, errors: [{ field: "file", message: `File not found: ${absPath}` }] };
  }

  let data: Record<string, unknown>;
  try {
    data = parseFrontmatter(fs.readFileSync(absPath, "utf-8"));
  } catch (e: unknown) {
    return { pass: false, errors: [{ field: "parse", message: (e as Error).message }] };
  }

  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  const validate = ajv.compile(SOUL_SCHEMA);
  const valid = validate(data);

  return {
    pass: valid,
    name: data.name,
    version: data.version,
    errors: valid ? [] : (validate.errors ?? []).map((e: import("ajv").ErrorObject) => ({
      field: e.instancePath?.replace(/^\//, "") || (e.params as Record<string,string>)?.missingProperty || "root",
      message: e.message,
    })),
  };
}

function scoreSoul(filePath: string) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
  const data = parseFrontmatter(fs.readFileSync(absPath, "utf-8"));
  const filled = OPTIONAL_FIELDS.filter(f => {
    const v = data[f];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });
  const score = Math.round((filled.length / OPTIONAL_FIELDS.length) * 100);
  return {
    score,
    filled,
    missing: OPTIONAL_FIELDS.filter(f => !filled.includes(f)),
    total: OPTIONAL_FIELDS.length,
  };
}

function generateTemplate(name: string, keywords: string[]): string {
  const domains = keywords.length > 0 ? keywords : ["(add your primary domain)"];
  return `---
name: "${name}"
version: "1.0.0"
description: "A [describe who this agent is in one sentence]."
personality: "You are ${name}. [Write 2-3 sentences about who this agent is — voice, not instructions. Describe character, disposition, and perspective.]"
tone: "Direct, [add descriptive words]."
values:
${domains.slice(0, 3).map(k => `  - ${k}`).join("\n")}
knowledge_domains:
${domains.map(k => `  - ${k}`).join("\n")}
memory_mode: session
---

## Identity

${name} is an AI agent defined by this soul file. Add extended background and context here.

## Knowledge

Facts this agent should know. End this section with:

Do not invent details beyond what is stated here.
`;
}

// ─── Server ───────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "soul-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "validate_soul_file",
      description: "Validate a SOUL.md file against the schema. Returns pass/fail and field-level errors.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the .soul.md file to validate." },
        },
        required: ["path"],
      },
    },
    {
      name: "generate_soul_template",
      description: "Generate a starter SOUL.md file for a given agent name and keywords.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "The agent's name." },
          keywords: {
            type: "array",
            items: { type: "string" },
            description: "Keywords describing the agent's domain or expertise.",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "score_soul_file",
      description: "Return a completeness score (0-100) for a SOUL.md file based on how many optional fields are filled.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the .soul.md file to score." },
        },
        required: ["path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "validate_soul_file") {
      const result = validateSoul(args!.path as string);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === "generate_soul_template") {
      const template = generateTemplate(
        args!.name as string,
        (args!.keywords as string[]) ?? []
      );
      return {
        content: [{ type: "text", text: template }],
      };
    }

    if (name === "score_soul_file") {
      const result = scoreSoul(args!.path as string);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err: unknown) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
(async () => {
  await server.connect(transport);
})();
