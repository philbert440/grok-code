import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface ProjectConfig {
  systemPrompt?: string;
  model?: string;
  contextBudget?: number;
  commandTimeout?: number;
  maxRounds?: number;
  verify?: string;
  files?: string[];
  rules?: string[];
}

export function loadProjectConfig(workDir: string): ProjectConfig {
  const configPath = resolve(workDir, '.grokcode');
  if (!existsSync(configPath)) return {};

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    // Validate and extract known fields
    const config: ProjectConfig = {};

    if (typeof parsed.systemPrompt === 'string') config.systemPrompt = parsed.systemPrompt;
    if (typeof parsed.model === 'string') config.model = parsed.model;
    if (typeof parsed.contextBudget === 'number') config.contextBudget = parsed.contextBudget;
    if (typeof parsed.commandTimeout === 'number') config.commandTimeout = parsed.commandTimeout;
    if (typeof parsed.maxRounds === 'number') config.maxRounds = parsed.maxRounds;
    if (typeof parsed.verify === 'string') config.verify = parsed.verify;
    if (Array.isArray(parsed.files)) config.files = parsed.files.filter((f: unknown) => typeof f === 'string');
    if (Array.isArray(parsed.rules)) config.rules = parsed.rules.filter((r: unknown) => typeof r === 'string');

    return config;
  } catch (e: any) {
    process.stderr.write(`Warning: Failed to parse .grokcode: ${e.message}\n`);
    return {};
  }
}
