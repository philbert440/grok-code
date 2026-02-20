import { YELLOW, RESET, log } from '../output/format.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(messages: ChatCompletionMessageParam[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content);
    }
  }
  return total;
}

export function compactMessages(messages: ChatCompletionMessageParam[], budgetTokens: number): ChatCompletionMessageParam[] {
  const totalTokens = estimateMessageTokens(messages);
  if (totalTokens <= 0.8 * budgetTokens) {
    return messages;
  }

  const modified = [...messages];
  const toolMessages: { index: number; content: string; tokens: number }[] = [];

  for (let i = 0; i < modified.length; i++) {
    const msg = modified[i];
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      const tokens = estimateTokens(msg.content);
      toolMessages.push({ index: i, content: msg.content, tokens });
    }
  }

  // Keep the most recent 5 tool results intact (last 5 in array)
  const keepCount = 5;
  const toCompact = toolMessages.slice(0, Math.max(0, toolMessages.length - keepCount));

  for (const { index, content, tokens } of toCompact) {
    modified[index].content = `[compacted - was ${tokens} tokens]`;
  }

  return modified;
}

export function warnIfOverBudget(tokens: number, budget: number): void {
  if (tokens > 0.8 * budget) {
    log(`${YELLOW}Warning: Context tokens (${tokens}) exceed 80% of budget (${budget})${RESET}\n`);
  }
}