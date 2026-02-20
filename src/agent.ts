import { createClient } from './api/client.js';
import { tools, executeTool, stats } from './tools/index.js';
import { CYAN, YELLOW, GREEN, RED, DIM, RESET, log } from './output/format.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { globSync } from 'glob';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { estimateMessageTokens, compactMessages, warnIfOverBudget } from './context/manager.js';
import { generateDiffs } from './output/diff.js';

export interface AgentConfig {
  apiKey: string;
  model: string;
  workDir: string;
  prompt: string;
  maxRounds: number;
  verbose: boolean;
  contextBudget: number;
  files?: string[];
  noDiff: boolean;
  verify?: string;
  commandTimeout: number;
  projectSystemPrompt?: string;
  projectRules?: string[];
  json: boolean;
}

export interface AgentResult {
  success: boolean;
  rounds: number;
  filesModified: string[];
  commandsRun: number;
  verifyPassed: boolean | null; // null = no verify configured
  verifyAttempts: number;
}

const BASE_SYSTEM_PROMPT = `You are a principal-level software engineer — not just senior, principal. You write code that ships to production without review passes.

## Standards
- **Verify before assuming.** Read the actual code, schemas, configs, and directory structure. Confirm names, paths, and types exist before referencing them. Never guess.
- **Correctness over speed.** Handle edge cases, error states, and resource cleanup. Every resource you open gets closed. Every listener gets removed. Every async operation gets cancellation.
- **Security by default.** Scope data access to the authenticated user. Validate and sanitize inputs. Never trust client-provided data for authorization decisions.
- **Match existing patterns.** Read neighboring files before writing new ones. Follow the project's naming, error handling, file structure, and style conventions exactly.
- **Minimal surface area.** Don't compute server-side what's trivial client-side. Don't add abstractions without justification. Keep changes focused.
- **Test your assumptions.** If a route, import, type, or API endpoint is referenced, verify it exists by reading the file or listing the directory.

## Process
1. Read existing code first — understand patterns, data model, and architecture before writing.
2. Verify that all imports, routes, links, and references point to things that actually exist.
3. After changes, the build will be verified automatically if configured. Write correct code the first time.
4. If something is ambiguous, investigate. Read another file. Search the codebase. Don't assume.

## Rules Enforcement
- Project rules marked with MUST or NEVER are non-negotiable. Follow them exactly.
- When existing code uses a specific library or pattern (e.g., an ORM query builder), use that same pattern. Do not switch to raw SQL, raw fetch, or alternative approaches unless the rule explicitly says to.

## Pre-Completion Checklist
Before you give your final response, verify:
- [ ] All new files use the same patterns as existing neighboring files
- [ ] All hrefs/links point to routes that actually exist (list the directory to check)
- [ ] All event listeners and subscriptions have cleanup
- [ ] All fetch calls have AbortController where appropriate
- [ ] UI state is cleaned up on navigation (close modals, clear inputs)
- [ ] Types are explicit — no implicit 'any', no unsafe casts

You have tools for reading files, writing files, editing files, running commands, listing directories, and searching codebases. Use them.`;

function buildSystemPrompt(config: AgentConfig): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (config.projectSystemPrompt) {
    prompt += `\n\n## Project Context\n${config.projectSystemPrompt}`;
  }

  if (config.projectRules && config.projectRules.length > 0) {
    prompt += `\n\n## Project Rules (follow strictly — MUST/NEVER are non-negotiable)`;
    config.projectRules.forEach((rule, i) => {
      prompt += `\n${i + 1}. ${rule}`;
    });
  }

  if (config.verify) {
    prompt += `\n\n## Verification\nAfter completing your changes, a verification command (\`${config.verify}\`) will be run automatically. If it fails, you'll be given the output to fix. Write correct code the first time.`;
  }

  return prompt;
}

const spinnerFrames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

function startSpinner(): NodeJS.Timeout {
  let i = 0;
  return setInterval(() => {
    process.stderr.write(`\r${spinnerFrames[i]} `);
    i = (i + 1) % spinnerFrames.length;
  }, 100);
}

function stopSpinner(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  process.stderr.write('\r \r');
}

/**
 * Run one pass of the agent loop. Returns when the model produces a final
 * text response (no tool calls) or hits maxRounds.
 */
async function runAgentPass(
  client: ReturnType<typeof createClient>,
  messages: ChatCompletionMessageParam[],
  config: AgentConfig,
  roundOffset: number,
): Promise<{ rounds: number; messages: ChatCompletionMessageParam[] }> {
  let rounds = 0;

  for (let round = 0; round < config.maxRounds; round++) {
    rounds++;

    // Compact messages if needed
    const currentTokens = estimateMessageTokens(messages);
    warnIfOverBudget(currentTokens, config.contextBudget);
    const compactedMessages = compactMessages(messages, config.contextBudget);
    if (compactedMessages !== messages) {
      messages = compactedMessages;
    }

    const spinner = startSpinner();

    const stream = await client.chat.completions.create({
      model: config.model,
      messages,
      tools,
      stream: true,
    });

    stopSpinner(spinner);

    let accumulatedContent = '';
    const toolCalls: { [index: number]: { id?: string; function: { name: string; arguments: string } } } = {};
    let hasToolCalls = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        process.stdout.write(delta.content);
        accumulatedContent += delta.content;
      }
      if (delta?.tool_calls) {
        hasToolCalls = true;
        for (const tcDelta of delta.tool_calls) {
          const idx = tcDelta.index!;
          if (!toolCalls[idx]) {
            toolCalls[idx] = { function: { name: '', arguments: '' } };
          }
          if (tcDelta.id) toolCalls[idx].id = tcDelta.id;
          if (tcDelta.function?.name) toolCalls[idx].function.name += tcDelta.function.name;
          if (tcDelta.function?.arguments) toolCalls[idx].function.arguments += tcDelta.function.arguments;
        }
      }
    }

    // Reconstruct full tool_calls
    const fullToolCalls = Object.values(toolCalls).map(tc => ({
      id: tc.id!,
      type: 'function' as const,
      function: tc.function,
    }));

    const assistantMsg: ChatCompletionMessageParam = {
      role: 'assistant',
      content: accumulatedContent || null,
      tool_calls: fullToolCalls.length > 0 ? fullToolCalls : undefined,
    };

    messages.push(assistantMsg);

    if (hasToolCalls) {
      for (const tc of fullToolCalls) {
        const name = tc.function.name;
        const argsStr = tc.function.arguments;

        if (config.verbose) {
          log(`${YELLOW}⚡ ${name}${RESET}(${argsStr})\n`);
        } else {
          log(`${YELLOW}⚡ ${name}${RESET}\n`);
        }

        const result = executeTool(name, argsStr, config.workDir, stats, config.commandTimeout);

        if (config.verbose) {
          const preview = result.length > 500 ? result.slice(0, 500) + "..." : result;
          log(`${DIM}${preview}${RESET}\n`);
        }

        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      const tokensAfter = estimateMessageTokens(messages);
      log(`${DIM}Tokens after round ${roundOffset + rounds}: ${tokensAfter}${RESET}\n`);
      continue;
    }

    // Final text response
    if (accumulatedContent && !accumulatedContent.endsWith("\n")) {
      process.stdout.write("\n");
    }
    const tokensAfter = estimateMessageTokens(messages);
    log(`${DIM}Tokens after round ${roundOffset + rounds}: ${tokensAfter}${RESET}\n`);
    break;
  }

  return { rounds, messages };
}

function runVerifyCommand(command: string, workDir: string, timeout: number): { success: boolean; output: string } {
  try {
    const output = execSync(command, {
      cwd: workDir,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: output || '(no output)' };
  } catch (e: any) {
    const stdout = e.stdout || '';
    const stderr = e.stderr || '';
    return { success: false, output: `Exit code ${e.status ?? 'unknown'}\n${stdout}\n${stderr}`.trim() };
  }
}

export async function runAgent(config: AgentConfig): Promise<AgentResult> {
  const client = createClient(config.apiKey);

  let userContent = config.prompt;

  // File pre-loading
  if (config.files && config.files.length > 0) {
    const preloaded: string[] = [];
    for (const pattern of config.files) {
      const paths = globSync(pattern, { cwd: config.workDir });
      for (const path of paths) {
        const fullPath = resolve(config.workDir, path);
        const content = readFileSync(fullPath, 'utf-8');
        preloaded.push(`--- ${path} ---\n${content}`);
      }
    }
    if (preloaded.length > 0) {
      userContent = `Pre-loaded files:\n\n${preloaded.join('\n\n')}\n\n${userContent}`;
    }
  }

  // Auto-include file listing if <20 files
  const files = readdirSync(config.workDir);
  if (files.length < 20) {
    const listing = `Files in directory:\n${files.join('\n')}\n\n`;
    userContent = listing + userContent;
  }

  const systemPrompt = buildSystemPrompt(config);

  let messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const hasProjectConfig = !!(config.projectSystemPrompt || (config.projectRules && config.projectRules.length > 0));
  log(`${CYAN}grok-code${RESET} v2.0 — model: ${config.model} | dir: ${config.workDir}${hasProjectConfig ? ' | .grokcode loaded' : ''}\n`);
  if (config.verify) {
    log(`${DIM}Verify: ${config.verify}${RESET}\n`);
  }
  log('\n');

  let totalRounds = 0;
  let verifyPassed: boolean | null = null;
  let verifyAttempts = 0;

  // Main agent pass
  const result = await runAgentPass(client, messages, config, totalRounds);
  totalRounds += result.rounds;
  messages = result.messages;

  // Verify loop
  if (config.verify) {
    const maxAttempts = 3;
    verifyPassed = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      verifyAttempts = attempt;
      log(`\n${CYAN}── Verify (attempt ${attempt}/${maxAttempts}) ──${RESET}\n`);
      log(`${DIM}$ ${config.verify}${RESET}\n`);

      const verifyResult = runVerifyCommand(config.verify, config.workDir, config.commandTimeout * 4);

      if (verifyResult.success) {
        log(`${GREEN}✓ Verification passed${RESET}\n`);
        verifyPassed = true;
        break;
      }

      log(`${RED}✗ Verification failed${RESET}\n`);

      if (attempt === maxAttempts) {
        log(`${RED}Giving up after ${maxAttempts} verify attempts.${RESET}\n`);
        break;
      }

      // Feed errors back to the agent
      const errorContent = `The verification command \`${config.verify}\` failed. Fix the errors and try again:\n\n\`\`\`\n${verifyResult.output.slice(0, 8000)}\n\`\`\``;
      messages.push({ role: "user", content: errorContent });

      const fixResult = await runAgentPass(client, messages, config, totalRounds);
      totalRounds += fixResult.rounds;
      messages = fixResult.messages;
    }
  }

  const agentResult: AgentResult = {
    success: verifyPassed === null ? true : verifyPassed,
    rounds: totalRounds,
    filesModified: [...stats.filesModified],
    commandsRun: stats.commandsRun,
    verifyPassed,
    verifyAttempts,
  };

  // Output
  if (config.json) {
    process.stdout.write(JSON.stringify(agentResult, null, 2) + '\n');
  } else {
    log(
      `\n${CYAN}── Summary ──${RESET}\n` +
        `Rounds: ${totalRounds} | Files modified: ${stats.filesModified.size} | Commands run: ${stats.commandsRun}` +
        (verifyPassed !== null ? ` | Verify: ${verifyPassed ? `${GREEN}passed${RESET}` : `${RED}failed${RESET}`} (${verifyAttempts} attempt${verifyAttempts !== 1 ? 's' : ''})` : '') +
        '\n'
    );
    if (stats.filesModified.size > 0) {
      log(`Files: ${[...stats.filesModified].join(", ")}\n`);
    }
    if (!config.noDiff) {
      const diffs = generateDiffs(config.workDir);
      if (diffs) {
        log(`\n${CYAN}── Diffs ──${RESET}\n${diffs}\n`);
      }
    }
  }

  return agentResult;
}
