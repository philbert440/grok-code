import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { globSync } from "glob";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { resolvePath } from './resolve.js';
import { loadIgnorePatterns, shouldIgnore } from '../config/ignore.js';
import { snapshotFile } from '../output/diff.js';

export function toolReadFile(workDir: string, args: { path: string; offset?: number; limit?: number }): string {
  snapshotFile(workDir, args.path);
  try {
    const content = readFileSync(resolvePath(workDir, args.path), "utf-8");
    if (args.offset || args.limit) {
      const lines = content.split('\n');
      const start = (args.offset || 1) - 1; // 1-indexed to 0-indexed
      const count = args.limit || lines.length;
      const slice = lines.slice(start, start + count);
      const totalLines = lines.length;
      let result = slice.join('\n');
      if (start + count < totalLines) {
        result += `\n\n[... ${totalLines - start - count} more lines. Use offset=${start + count + 1} to continue.]`;
      }
      return result;
    }
    return content;
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

export function toolWriteFile(workDir: string, args: { path: string; content: string }, stats: { filesModified: Set<string> }): string {
  snapshotFile(workDir, args.path);
  try {
    const fp = resolvePath(workDir, args.path);
    mkdirSync(dirname(fp), { recursive: true });
    writeFileSync(fp, args.content);
    stats.filesModified.add(args.path);
    return `Wrote ${args.path}`;
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

export function toolEditFile(workDir: string, args: { path: string; old_text: string; new_text: string }, stats: { filesModified: Set<string> }): string {
  snapshotFile(workDir, args.path);
  try {
    const fp = resolvePath(workDir, args.path);
    const content = readFileSync(fp, "utf-8");
    const oldText = args.old_text.trim();
    const newText = args.new_text.trim();
    if (!content.includes(oldText)) return "Error: old_text not found in file";
    writeFileSync(fp, content.replaceAll(oldText, newText));
    stats.filesModified.add(args.path);
    return `Edited ${args.path}`;
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

export function toolListFiles(workDir: string, args: { path: string; recursive?: boolean }): string {
  try {
    const fp = resolvePath(workDir, args.path);
    const patterns = loadIgnorePatterns(workDir);
    if (args.recursive) {
      const allFiles = globSync("**/*", { cwd: fp, nodir: true, dot: false });
      const filtered = allFiles.filter(file => !shouldIgnore(file, patterns));
      return filtered.join("\n") || "(empty)";
    }
    const allItems = readdirSync(fp)
      .map((f) => {
        const s = statSync(resolve(fp, f));
        return s.isDirectory() ? f + "/" : f;
      });
    const filtered = allItems.filter(item => !shouldIgnore(item, patterns));
    return filtered.join("\n") || "(empty)";
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

export const fileToolDefs: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file. For large files, use offset and limit to read in chunks.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to working directory" },
          offset: { type: "number", description: "Line number to start reading from (1-indexed)" },
          limit: { type: "number", description: "Maximum number of lines to read" },
        },
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
      description: "Find and replace ALL occurrences of text in a file",
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
];