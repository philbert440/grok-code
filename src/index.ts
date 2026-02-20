#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "path";
import { runAgent } from './agent.js';

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
  .option("--context-budget <tokens>", "Context token budget", "200000")
  .option("-f, --files <paths...>", "Pre-load files (supports globs)")
  .option("--no-diff", "Do not show diffs at the end")
  .parse();

const opts = program.opts<{
  prompt: string;
  directory: string;
  model: string;
  apiKey?: string;
  maxRounds: string;
  verbose?: boolean;
  contextBudget: string;
  files?: string[];
  diff: boolean;
}>();

const apiKey = opts.apiKey || process.env.XAI_API_KEY;
if (!apiKey) {
  process.stderr.write("Error: No API key. Set XAI_API_KEY or use -k.\n");
  process.exit(1);
}

const workDir = resolve(opts.directory);
const maxRounds = parseInt(opts.maxRounds, 10);
const verbose = !!opts.verbose;
const contextBudget = parseInt(opts.contextBudget, 10);

runAgent({
  apiKey,
  model: opts.model,
  workDir,
  prompt: opts.prompt,
  maxRounds,
  verbose,
  contextBudget,
  files: opts.files,
  noDiff: opts.diff === false,
}).catch((err) => {
  process.stderr.write(`\x1b[31mError: ${err.message}\x1b[0m\n`);
  process.exit(1);
});