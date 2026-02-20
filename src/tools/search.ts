import { execSync } from "child_process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { resolvePath } from './resolve.js';
import { loadIgnorePatterns } from '../config/ignore.js';

export function toolSearchFiles(workDir: string, args: { pattern: string; path?: string }): string {
  try {
    const cwd = args.path ? resolvePath(workDir, args.path) : workDir;
    const patterns = loadIgnorePatterns(workDir);
    let cmd = `grep -rn --include='*'`;
    for (const pat of patterns) {
      if (pat.endsWith('/')) {
        cmd += ` --exclude-dir=${JSON.stringify(pat.slice(0, -1))}`;
      } else {
        cmd += ` --exclude=${JSON.stringify(pat)}`;
      }
    }
    cmd += ` ${JSON.stringify(args.pattern)} . 2>/dev/null | head -100`;
    const out = execSync(cmd, { cwd, encoding: "utf-8", timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
    return out || "(no matches)";
  } catch (e: any) {
    if (e.status === 1) return "(no matches)";
    return `Error: ${e.message}`;
  }
}

export const searchToolDefs: ChatCompletionTool[] = [
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