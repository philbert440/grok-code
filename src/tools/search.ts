import { globSync } from "glob";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { resolvePath } from './resolve.js';
import { loadIgnorePatterns } from '../config/ignore.js';

export function toolSearchFiles(workDir: string, args: { pattern: string; path?: string }): string {
  try {
    const cwd = args.path ? resolvePath(workDir, args.path) : workDir;
    const ignorePatterns = loadIgnorePatterns(workDir);
    const files = globSync(args.pattern, { cwd, ignore: ignorePatterns });
    return files.join('\n') || "(no matches)";
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

export const searchToolDefs: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Find files matching a glob pattern",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern" },
          path: { type: "string", description: "Directory to search (optional)" },
        },
        required: ["pattern"],
      },
    },
  },
];