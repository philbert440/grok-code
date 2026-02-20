import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { RED, GREEN, CYAN, RESET } from './format.js';

export const fileSnapshots = new Map<string, string>();

export function snapshotFile(workDir: string, filePath: string): void {
  if (fileSnapshots.has(filePath)) return;
  const fullPath = resolve(workDir, filePath);
  if (existsSync(fullPath)) {
    fileSnapshots.set(filePath, readFileSync(fullPath, 'utf-8'));
  } else {
    fileSnapshots.set(filePath, '');
  }
}

export function generateDiffs(workDir: string): string {
  const diffs: string[] = [];
  for (const [filePath, original] of fileSnapshots) {
    const fullPath = resolve(workDir, filePath);
    let current = '';
    if (existsSync(fullPath)) {
      current = readFileSync(fullPath, 'utf-8');
    }
    if (original === current) continue;
    // Use diff -u with temp files
    try {
      const tmpDir = tmpdir();
      const origFile = resolve(tmpDir, `orig-${Date.now()}-${Math.random()}.txt`);
      const currFile = resolve(tmpDir, `curr-${Date.now()}-${Math.random()}.txt`);
      writeFileSync(origFile, original);
      writeFileSync(currFile, current);
      let diffOutput: string;
      try {
        diffOutput = execSync(`diff -u ${origFile} ${currFile}`, { encoding: 'utf-8' });
      } catch (e: any) {
        // diff exits 1 when files differ — that's expected
        if (e.status === 1 && e.stdout) {
          diffOutput = e.stdout;
        } else {
          unlinkSync(origFile);
          unlinkSync(currFile);
          continue;
        }
      }
      unlinkSync(origFile);
      unlinkSync(currFile);
      // Replace temp file paths with the actual file path
      const formatted = diffOutput.split('\n').map(line => {
        if (line.startsWith('---') || line.startsWith('+++')) {
          const label = line.startsWith('---') ? `--- a/${filePath}` : `+++ b/${filePath}`;
          return `${CYAN}${label}${RESET}`;
        } else if (line.startsWith('-')) {
          return `${RED}${line}${RESET}`;
        } else if (line.startsWith('+')) {
          return `${GREEN}${line}${RESET}`;
        } else if (line.startsWith('@@')) {
          return `${CYAN}${line}${RESET}`;
        } else {
          return line;
        }
      }).join('\n');
      diffs.push(formatted);
    } catch (e: any) {
      // Unexpected error, skip
    }
  }
  return diffs.join('\n\n');
}