import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export function loadIgnorePatterns(workDir: string): string[] {
  const patterns: string[] = [];

  // Read .grokignore
  const grokignorePath = resolve(workDir, '.grokignore');
  if (existsSync(grokignorePath)) {
    const content = readFileSync(grokignorePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed);
      }
    }
  }

  // Read .gitignore
  const gitignorePath = resolve(workDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed);
      }
    }
  }

  // Defaults
  const defaults = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '*.pyc', '.DS_Store'];
  for (const def of defaults) {
    if (!patterns.includes(def)) {
      patterns.push(def);
    }
  }

  return patterns;
}

export function shouldIgnore(filePath: string, patterns: string[]): boolean {
  for (const pat of patterns) {
    if (matchesPattern(filePath, pat)) {
      return true;
    }
  }
  return false;
}

function matchesPattern(filePath: string, pattern: string): boolean {
  // Remove leading /
  const pat = pattern.replace(/^\/+/, '');

  if (pat.includes('*')) {
    // Simple wildcard: replace * with .* and test
    const regex = new RegExp('^' + pat.replace(/\*/g, '.*').replace(/\//g, '\\/') + '$');
    return regex.test(filePath);
  } else if (pat.endsWith('/')) {
    // Directory match
    const dir = pat.slice(0, -1);
    return filePath.startsWith(dir + '/') || filePath === dir;
  } else {
    // Exact match or file in any dir
    return filePath === pat || filePath.endsWith('/' + pat);
  }
}