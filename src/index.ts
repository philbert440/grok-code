#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "path";
import { globSync } from "glob";
import { runAgent } from './agent.js';
import { loadProjectConfig } from './config/project.js';

const program = new Command();
program
  .name("grok-code")
  .version("2.0.0")
  .description("Agentic coding CLI powered by xAI Grok")
  .requiredOption("-p, --prompt <prompt>", "Task prompt")
  .option("-d, --directory <dir>", "Working directory", process.cwd())
  .option("-m, --model <model>", "Model to use")
  .option("-k, --api-key <key>", "xAI API key (or XAI_API_KEY env)")
  .option("--max-rounds <n>", "Max tool-call rounds")
  .option("--verbose", "Print full tool call details to stderr")
  .option("--context-budget <tokens>", "Context token budget")
  .option("-f, --files <paths...>", "Pre-load files (supports globs)")
  .option("--no-diff", "Do not show diffs at the end")
  .option("--verify <command>", "Run verification command after completion (e.g. 'npm run build')")
  .option("--cmd-timeout <ms>", "Shell command timeout in ms")
  .option("--json", "Output structured JSON result instead of pretty summary")
  .parse();

const opts = program.opts<{
  prompt: string;
  directory: string;
  model?: string;
  apiKey?: string;
  maxRounds?: string;
  verbose?: boolean;
  contextBudget?: string;
  files?: string[];
  diff: boolean;
  verify?: string;
  cmdTimeout?: string;
  json?: boolean;
}>();

const apiKey = opts.apiKey || process.env.XAI_API_KEY;
if (!apiKey) {
  process.stderr.write("Error: No API key. Set XAI_API_KEY or use -k.\n");
  process.exit(1);
}

const workDir = resolve(opts.directory);

// Calculate dynamic budget based on files
const fileCount = globSync('**/*', { cwd: workDir, ignore: ['node_modules/**', '.git/**'], dot: false }).length;
const minBudget = 50000;
const maxBudget = 300000;
const dynamicBudget = Math.min(maxBudget, Math.max(minBudget, minBudget + fileCount * 200));

// Load project config — CLI flags override
const projectConfig = loadProjectConfig(workDir);

const model = opts.model || projectConfig.model || 'grok-4-1-fast-reasoning';
const maxRounds = opts.maxRounds ? parseInt(opts.maxRounds, 10) : (projectConfig.maxRounds || 100);
const verbose = !!opts.verbose;
const contextBudget = opts.contextBudget ? parseInt(opts.contextBudget, 10) : (projectConfig.contextBudget || dynamicBudget);
const commandTimeout = opts.cmdTimeout ? parseInt(opts.cmdTimeout, 10) : (projectConfig.commandTimeout || 30000);
const verify = opts.verify || projectConfig.verify;

// Merge file lists: CLI files + project config files (deduplicated)
const files = [...new Set([...(projectConfig.files || []), ...(opts.files || [])])];

runAgent({
  apiKey,
  model,
  workDir,
  prompt: opts.prompt,
  maxRounds,
  verbose,
  contextBudget,
  files: files.length > 0 ? files : undefined,
  noDiff: opts.diff === false,
  verify,
  commandTimeout,
  projectSystemPrompt: projectConfig.systemPrompt,
  projectRules: projectConfig.rules,
  json: !!opts.json,
}).then((result) => {
  process.exit(result.success ? 0 : 1);
}).catch((err) => {
  process.stderr.write(`\x1b[31mError: ${err.message}\x1b[0m\n`);
  process.exit(2);
});
