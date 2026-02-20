import { execSync } from "child_process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { resolvePath } from './resolve.js';

let commandsRun = 0;

export function toolRunCommand(workDir: string, args: { command: string; cwd?: string }, timeout: number = 30000): string {
  try {
    const cwd = args.cwd ? resolvePath(workDir, args.cwd) : workDir;
    commandsRun++;
    const out = execSync(args.command, {
      cwd,
      timeout,
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

export const commandToolDefs: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Execute a shell command",
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
];

export function getCommandsRun(): number {
  return commandsRun;
}