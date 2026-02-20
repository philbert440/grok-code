#!/usr/bin/env node

import { Command } from "commander";
import OpenAI from "openai";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { resolve, dirname, relative } from "path";
import { globSync } from "glob";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

// ── CLI ─────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("grok-code")
  .version("1.0.0")
  .description("Agentic coding CLI powered by xAI Grok")
  .requiredOption("-p, --prompt <prompt>", "Task prompt")
  .option("-d, --directory <dir>", "Working directory", process.cwd())
  .option("-m, --model <model>", "Model to use", "grok-code-fast-1")
  .option("-k, --api-key <key>", "xAI API key (or XAI_API_KEY env)")
  .option("--max-rounds <n>", "Max tool-call rounds", "100")
  .option("--verbose", "Print full tool call details to stderr")
  .parse();

const opts = program.opts<{
  prompt: string;
  directory: string;
  model: string;
  apiKey?: string;
  maxRounds: string;
  verbose?: boolean;
}>();

const apiKey = opts.apiKey || process.env.XAI_API_KEY;
if (!apiKey) {
  process.stderr.write("Error: No API key. Set XAI_API_KEY or use -k.\n");
  process.exit(1);
}

const workDir = resolve(opts.directory);
const maxRounds = parseInt(opts.maxRounds, 10);
const verbose = !!opts.verbose;

// ── Stats ───────────────────────────────────────────────────────────────────

const stats = { rounds: 0, filesModified: new Set<string>(), commandsRun: 0 };

// ── Tool implementations ────────────────────────────────────────────────────

function resolvePath(p: string): string {
  return resolve(workDir, p);
}

function toolReadFile(args: { path: string }): string {
  try {
    return readFileSync(resolvePath(args.path), "utf-8");
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

function toolWriteFile(args: { path: string; content: string }): string {
  try {
    const fp = resolvePath(args.path);
    mkdirSync(dirname(fp), { recursive: true });
    writeFileSync(fp, args.content);
    stats.filesModified.add(args.path);
    return `Wrote ${args.path}`;
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

function toolEditFile(args: { path: string; old_text: string; new_text: string }): string {
  try {
    const fp = resolvePath(args.path);
    const content = readFileSync(fp, "utf-8");
    if (!content.includes(args.old_text)) return "Error: old_text not found in file";
    writeFileSync(fp, content.replace(args.old_text, args.new_text));
    stats.filesModified.add(args.path);
    return `Edited ${args.path}`;
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

function toolRunCommand(args: { command: string; cwd?: string }): string {
  try {
    const cwd = args.cwd ? resolvePath(args.cwd) : workDir;
    stats.commandsRun++;
    const out = execSync(args.command, {
      cwd,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out || "(no output)";
  } catch (e: any) {
    const stdout = e.stdout || "";
    const stderr = e.stderr || "";
    return `Exit code ${e.status ?? "unknown"}\nstdout: ${stdout}\nstderr: ${stderr}`;
  }
}

function toolListFiles(args: { path: string; recursive?: boolean }): string {
  try {
    const fp = resolvePath(args.path);
    if (args.recursive) {
      const files = globSync("**/*", { cwd: fp, nodir: true, dot: false });
      return files.join("\n") || "(empty)";
    }
    return readdirSync(fp)
      .map((f) => {
        const s = statSync(resolve(fp, f));
        return s.isDirectory() ? f + "/" : f;
      })
      .join("\n") || "(empty)";
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

function toolSearchFiles(args: { pattern: string; path?: string }): string {
  try {
    const cwd = args.path ? resolvePath(args.path) : workDir;
    const out = execSync(
      `grep -rn --include='*' ${JSON.stringify(args.pattern)} . 2>/dev/null | head -100`,
      { cwd, encoding: "utf-8", timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
    );
    return out || "(no matches)";
  } catch (e: any) {
    if (e.status === 1) return "(no matches)";
    return `Error: ${e.message}`;
  }
}

function executeTool(name: string, argsJson: string): string {
  const args = JSON.parse(argsJson);
  switch (name) {
    case "read_file": return toolReadFile(args);
    case "write_file": return toolWriteFile(args);
    case "edit_file": return toolEditFile(args);
    case "run_command": return toolRunCommand(args);
    case "list_files": return toolListFiles(args);
    case "search_files": return toolSearchFiles(args);
    default: return `Unknown tool: ${name}`;
  }
}

// ── Tool definitions ────────────────────────────────────────────────────────

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path relative to working directory" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file (creates parent dirs automatically)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "File content" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Find and replace text in a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_text: { type: "string", description: "Exact text to find" },
          new_text: { type: "string", description: "Replacement text" },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Execute a shell command (30s timeout)",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files in a directory",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          recursive: { type: "boolean", description: "List recursively" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for a pattern in files (grep)",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Search pattern" },
          path: { type: "string", description: "Directory to search (optional)" },
        },
        required: ["pattern"],
      },
    },
  },
];

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are an expert software engineer. You have access to tools for reading, writing, and editing files, running shell commands, and searching codebases. Complete the user's request by using these tools. Be thorough and precise.";

// ── Main loop ───────────────────────────────────────────────────────────────

async function main() {
  const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: opts.prompt },
  ];

  process.stderr.write(`\x1b[36mgrok-code\x1b[0m — model: ${opts.model} | dir: ${workDir}\n\n`);

  for (let round = 0; round < maxRounds; round++) {
    stats.rounds = round + 1;

    // Try non-streaming first to handle tool calls simply
    const response = await client.chat.completions.create({
      model: opts.model,
      messages,
      tools,
      stream: false,
    });

    const choice = response.choices[0];
    const msg = choice.message;

    // If there are tool calls, execute them
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg);

      for (const tc of msg.tool_calls) {
        const name = tc.function.name;
        const argsStr = tc.function.arguments;

        if (verbose) {
          process.stderr.write(`\x1b[33m⚡ ${name}\x1b[0m(${argsStr})\n`);
        } else {
          process.stderr.write(`\x1b[33m⚡ ${name}\x1b[0m\n`);
        }

        const result = executeTool(name, argsStr);

        if (verbose) {
          const preview = result.length > 500 ? result.slice(0, 500) + "..." : result;
          process.stderr.write(`\x1b[2m${preview}\x1b[0m\n`);
        }

        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      continue;
    }

    // Final text response — print it
    if (msg.content) {
      process.stdout.write(msg.content);
      if (!msg.content.endsWith("\n")) process.stdout.write("\n");
    }
    break;
  }

  // Summary
  process.stderr.write(
    `\n\x1b[36m── Summary ──\x1b[0m\n` +
      `Rounds: ${stats.rounds} | Files modified: ${stats.filesModified.size} | Commands run: ${stats.commandsRun}\n`
  );
  if (stats.filesModified.size > 0) {
    process.stderr.write(`Files: ${[...stats.filesModified].join(", ")}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`\x1b[31mError: ${err.message}\x1b[0m\n`);
  process.exit(1);
});
