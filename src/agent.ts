import { createClient } from './api/client.js';
import { tools, executeTool, stats } from './tools/index.js';
import { CYAN, YELLOW, DIM, RESET, log } from './output/format.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { globSync } from 'glob';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
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
}

const SYSTEM_PROMPT =
  "You are an expert software engineer. You have access to tools for reading, writing, and editing files, running shell commands, and searching codebases. Complete the user's request by using these tools. Be thorough and precise.";

export async function runAgent(config: AgentConfig) {
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

  let messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  log(`${CYAN}grok-code${RESET} — model: ${config.model} | dir: ${config.workDir}\n\n`);

  const spinnerFrames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let spinnerInterval: NodeJS.Timeout | null = null;

  const startSpinner = () => {
    let i = 0;
    spinnerInterval = setInterval(() => {
      process.stderr.write(`\r${spinnerFrames[i]} `);
      i = (i + 1) % spinnerFrames.length;
    }, 100);
  };

  const stopSpinner = () => {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
      process.stderr.write('\r \r'); // clear
    }
  };

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

    startSpinner();

    const stream = await client.chat.completions.create({
      model: config.model,
      messages,
      tools,
      stream: true,
    });

    stopSpinner();

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

        const result = executeTool(name, argsStr, config.workDir, stats);

        if (config.verbose) {
          const preview = result.length > 500 ? result.slice(0, 500) + "..." : result;
          log(`${DIM}${preview}${RESET}\n`);
        }

        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      // Log token count after round
      const tokensAfter = estimateMessageTokens(messages);
      log(`${DIM}Tokens after round ${rounds}: ${tokensAfter}${RESET}\n`);
      continue;
    }

    // If no tool calls, it's final text, add newline if needed
    if (accumulatedContent && !accumulatedContent.endsWith("\n")) {
      process.stdout.write("\n");
    }
    // Log token count
    const tokensAfter = estimateMessageTokens(messages);
    log(`${DIM}Tokens after round ${rounds}: ${tokensAfter}${RESET}\n`);
    break;
  }

  // Summary
  log(
    `\n${CYAN}── Summary ──${RESET}\n` +
      `Rounds: ${rounds} | Files modified: ${stats.filesModified.size} | Commands run: ${stats.commandsRun}\n`
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