import { toolReadFile, toolWriteFile, toolEditFile, toolListFiles, fileToolDefs } from './files.js';
import { toolSearchFiles, searchToolDefs } from './search.js';
import { toolRunCommand, commandToolDefs, getCommandsRun } from './commands.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const tools: ChatCompletionTool[] = [
  ...fileToolDefs,
  ...searchToolDefs,
  ...commandToolDefs,
];

export const stats = { filesModified: new Set<string>(), commandsRun: 0 };

export function executeTool(name: string, argsJson: string, workDir: string, stats: { filesModified: Set<string>, commandsRun: number }): string {
  const args = JSON.parse(argsJson);
  switch (name) {
    case "read_file": return toolReadFile(workDir, args);
    case "write_file": return toolWriteFile(workDir, args, stats);
    case "edit_file": return toolEditFile(workDir, args, stats);
    case "run_command": {
      const result = toolRunCommand(workDir, args);
      stats.commandsRun = getCommandsRun();
      return result;
    }
    case "list_files": return toolListFiles(workDir, args);
    case "search_files": return toolSearchFiles(workDir, args);
    default: return `Unknown tool: ${name}`;
  }
}